import { debug as _debug } from '@debug';
import { WebSocket } from 'undici';
import { getAuthHeaders } from '../../api/auth';
import { ClientType, getClient } from '../../http/client';
import { requireRestAPIBaseUrl } from '../../http/httpConfig';
import { getDispatcher } from '../../http/proxy';

const debug = _debug.extend('watch');

type GraphQLError = { message: string };

/** GraphQL is served next to the REST API: `<rest>/graphql` and `<rest>/subscriptions`. */
function apiUrl(path: string) {
  const base = requireRestAPIBaseUrl();
  return new URL(path, base.endsWith('/') ? base : `${base}/`);
}

export async function graphqlQuery<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await getClient(ClientType.REST_API).request<{
    data?: T;
    errors?: GraphQLError[];
  }>({
    method: 'POST',
    url: 'graphql',
    data: { query, variables },
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders({ apiKey }),
    },
  });
  if (res.data.errors?.length || !res.data.data) {
    throw new Error(`GraphQL request failed: ${formatErrors(res.data.errors)}`);
  }
  return res.data.data;
}

export type Subscription = {
  query: string;
  variables: Record<string, unknown>;
  onNext: (data: any) => void;
};

export type SubscriptionConnection = {
  /** Resolves when the server acknowledged the connection and the subscriptions were sent. */
  ready: Promise<void>;
  /** Resolves on close(), rejects when the server closes or a subscription fails. */
  closed: Promise<void>;
  close(): void;
};

/**
 * A client for the `graphql-transport-ws` protocol, the one the API serves
 * with `graphql-ws`. It goes through undici so that HTTPS_PROXY and NO_PROXY
 * apply as for the other requests of the CLI.
 */
export function openSubscriptions(
  apiKey: string,
  subscriptions: Subscription[]
): SubscriptionConnection {
  const httpUrl = apiUrl('subscriptions');
  const wsUrl = new URL(httpUrl);
  wsUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(wsUrl, {
    protocols: ['graphql-transport-ws'],
    dispatcher: getDispatcher(httpUrl.toString()),
  });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  let closing = false;
  let onReady: () => void;
  let onClosed: (error?: Error) => void;
  const ready = new Promise<void>((resolve) => (onReady = resolve));
  const closed = new Promise<void>((resolve, reject) => {
    onClosed = (error) => (error ? reject(error) : resolve());
  });

  socket.addEventListener('open', () =>
    send({ type: 'connection_init', payload: { token: `Bearer ${apiKey}` } })
  );
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    debug('Websocket message: %s', message.type);
    switch (message.type) {
      case 'connection_ack':
        subscriptions.forEach(({ query, variables }, id) =>
          send({
            id: String(id),
            type: 'subscribe',
            payload: { query, variables },
          })
        );
        onReady();
        break;
      case 'next':
        if (message.payload?.errors?.length) {
          fail(new Error(formatErrors(message.payload.errors)));
        } else {
          subscriptions[Number(message.id)]?.onNext(message.payload?.data);
        }
        break;
      case 'error':
        fail(
          new Error(`Subscription failed: ${formatErrors(message.payload)}`)
        );
        break;
      case 'ping':
        send({ type: 'pong' });
        break;
    }
  });
  socket.addEventListener('close', (event) => {
    onClosed(
      closing
        ? undefined
        : new Error(
            `The connection to Currents closed (${event.code}${event.reason ? `: ${event.reason}` : ''})`
          )
    );
  });
  socket.addEventListener('error', () => {
    // A close event with the code follows.
  });

  function fail(error: Error) {
    onClosed(error);
    close();
  }
  function close() {
    closing = true;
    socket.close(1000);
  }
  return { ready, closed, close };
}

function formatErrors(errors?: GraphQLError[]) {
  return errors?.map((e) => e.message).join('; ') || 'no data in the response';
}

import http from 'http';
import { AddressInfo } from 'net';
import zlib from 'zlib';

export type RecordedRequest = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  /** The body parsed as JSON, gunzipped first when it is gzipped. */
  json: any;
};

export type Response =
  | { status: number; json?: unknown; body?: Buffer | string }
  // Closes the connection without answering.
  | { destroy: true };

export type Responder = (
  request: RecordedRequest
) => Response | Promise<Response>;

export type ApiServer = {
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
};

export async function startApiServer(responder: Responder): Promise<ApiServer> {
  const requests: RecordedRequest[] = [];

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const request: RecordedRequest = {
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      body,
      json: parseJson(body, req.headers['content-encoding']),
    };
    requests.push(request);

    const response = await responder(request);
    if ('destroy' in response) {
      req.socket.destroy();
      return;
    }
    if (response.json !== undefined) {
      res
        .writeHead(response.status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(response.json));
    } else {
      res.writeHead(response.status).end(response.body);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;

  return {
    url,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function parseJson(body: Buffer, contentEncoding?: string) {
  if (body.length === 0) {
    return undefined;
  }
  try {
    const text =
      contentEncoding === 'gzip'
        ? zlib.gunzipSync(body).toString()
        : body.toString();
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

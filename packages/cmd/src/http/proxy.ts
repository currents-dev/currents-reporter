import { Agent, Dispatcher, Pool, ProxyAgent } from 'undici';
import { debug as _debug } from '../debug';
import { urlForLog } from '../lib/url';
import { getProxyForUrl as getProxyFromEnv } from 'proxy-from-env';
import { shouldBypassProxy } from './noProxy';

const debug = _debug.extend('http');

function getEnv(key: string) {
  return process.env[key.toLowerCase()] || process.env[key.toUpperCase()] || '';
}

/**
 * The proxy for a URL from the environment, or an empty string, as axios 1.20
 * chose it: proxy-from-env 2.1.0, then the NO_PROXY check of axios.
 */
export function getProxyForUrl(url: string) {
  const proxy = getProxyFromEnv(url);
  if (!proxy || shouldBypassProxy(url, getEnv('no_proxy'))) return '';
  return proxy;
}

// undici times out a connection after 10 seconds and a response after 5
// minutes. The callers set their own timeouts, as they did with Node's http.
const NO_TIMEOUTS = { headersTimeout: 0, bodyTimeout: 0 };

const directAgent = new Agent({ ...NO_TIMEOUTS, connect: { timeout: 0 } });
const proxyAgents = new Map<string, ProxyAgent>();

/**
 * Sends through a CONNECT tunnel to an https URL, and as a forward proxy to an
 * http URL, as axios did.
 */
function getProxyAgent(proxyUrl: string) {
  let agent = proxyAgents.get(proxyUrl);
  if (agent) return agent;

  const { username, password } = new URL(proxyUrl);
  agent = new ProxyAgent({
    uri: proxyUrl,
    // ProxyAgent sends credentials only when the URL has both.
    token:
      username || password
        ? `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString('base64')}`
        : undefined,
    proxyTunnel: false,
    proxyTls: { timeout: 0 },
    ...NO_TIMEOUTS,
    factory: (origin, options) =>
      new Pool(origin, { ...options, ...NO_TIMEOUTS }),
  });
  proxyAgents.set(proxyUrl, agent);
  return agent;
}

export function getDispatcher(url: string): Dispatcher {
  const proxyUrl = getProxyForUrl(url);
  if (!proxyUrl) return directAgent;
  debug('Using HTTP proxy %s for %s', urlForLog(proxyUrl), urlForLog(url));
  return getProxyAgent(proxyUrl);
}

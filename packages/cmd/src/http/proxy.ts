import { Agent, Dispatcher, Pool, ProxyAgent } from 'undici';
import { debug as _debug } from '../debug';
import { urlForLog } from '../lib/url';
import { shouldBypassProxy } from './noProxy';

const debug = _debug.extend('http');

const DEFAULT_PORTS: Record<string, number> = {
  ftp: 21,
  gopher: 70,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
};

function getEnv(key: string) {
  return process.env[key.toLowerCase()] || process.env[key.toUpperCase()] || '';
}

/**
 * The proxy for a URL from the environment, or an empty string, as axios chose
 * it for requests to the API: proxy-from-env 2.1.0 (`<protocol>_proxy`, then
 * `all_proxy`, the lowercase name before the uppercase one, and the hosts and
 * ports of `no_proxy`), and then the NO_PROXY rules of axios.
 */
export function getProxyForUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  const protocol = parsed.protocol.slice(0, -1);
  const port = parseInt(parsed.port) || DEFAULT_PORTS[protocol] || 0;
  if (!parsed.hostname || !shouldProxy(parsed.hostname, port)) {
    return '';
  }

  let proxy = getEnv(`${protocol}_proxy`) || getEnv('all_proxy');
  if (!proxy || shouldBypassProxy(url, getEnv('no_proxy'))) return '';
  if (!proxy.includes('://')) proxy = `${protocol}://${proxy}`;
  return proxy;
}

// The NO_PROXY check of proxy-from-env.
function shouldProxy(hostname: string, port: number) {
  const noProxy = getEnv('no_proxy').toLowerCase();
  if (!noProxy) return true;
  if (noProxy === '*') return false;

  return noProxy.split(/[,\s]/).every((entry) => {
    if (!entry) return true;
    const withPort = entry.match(/^(.+):(\d+)$/);
    let entryHost = withPort ? withPort[1] : entry;
    const entryPort = withPort ? parseInt(withPort[2]) : 0;
    if (entryPort && entryPort !== port) return true;
    if (!/^[.*]/.test(entryHost)) return hostname !== entryHost;
    if (entryHost.startsWith('*')) entryHost = entryHost.slice(1);
    return !hostname.endsWith(entryHost);
  });
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

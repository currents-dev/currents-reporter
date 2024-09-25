import axios, { CreateAxiosDefaults } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import proxyFromEnv from 'proxy-from-env';

import { debug as _debug } from '../debug';

const debug = _debug.extend('axios');

export function getAxios(config: CreateAxiosDefaults = {}) {
  const instance = axios.create(config);

  instance.interceptors.request.use((config) => {
    const _config = { ...config };
    const uri = instance.getUri(config);
    const proxyURL = proxyFromEnv.getProxyForUrl(uri);
    if (proxyURL) {
      debug('Using HTTP proxy %s for %s ', proxyURL, uri);
      _config.proxy = false;
      _config.httpsAgent = getHTTPSProxyAgent(proxyURL);
    }
    return _config;
  });
  return instance;
}

let _httpsProxyAgent: null | HttpsProxyAgent<string> = null;
function getHTTPSProxyAgent(url: string) {
  if (_httpsProxyAgent) {
    return _httpsProxyAgent;
  }

  _httpsProxyAgent = new HttpsProxyAgent(url);
  return _httpsProxyAgent;
}

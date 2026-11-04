import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProxyForUrl } from '../proxy';

const PROXY_VARIABLES = [
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'npm_config_http_proxy',
  'npm_config_https_proxy',
  'npm_config_proxy',
  'npm_config_no_proxy',
];

describe('getProxyForUrl', () => {
  beforeEach(() => {
    for (const name of PROXY_VARIABLES) {
      vi.stubEnv(name, undefined);
      vi.stubEnv(name.toUpperCase(), undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the variable of the protocol of the URL', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://secure:1');
    vi.stubEnv('HTTP_PROXY', 'http://plain:2');

    expect(getProxyForUrl('https://cy.currents.dev/v1/runs')).toBe(
      'http://secure:1'
    );
    expect(getProxyForUrl('http://cy.currents.dev/v1/runs')).toBe(
      'http://plain:2'
    );
  });

  it('does not use HTTP_PROXY for an https URL', () => {
    vi.stubEnv('HTTP_PROXY', 'http://plain:2');

    expect(getProxyForUrl('https://cy.currents.dev')).toBe('');
  });

  it('reads the lowercase name before the uppercase one', () => {
    vi.stubEnv('https_proxy', 'http://lower:1');
    vi.stubEnv('HTTPS_PROXY', 'http://upper:2');

    expect(getProxyForUrl('https://cy.currents.dev')).toBe('http://lower:1');
  });

  it('falls back to ALL_PROXY, and adds the protocol of the URL to a proxy without one', () => {
    vi.stubEnv('ALL_PROXY', 'proxy.corp:3128');

    expect(getProxyForUrl('https://cy.currents.dev')).toBe(
      'https://proxy.corp:3128'
    );
  });

  it('does not read the proxy variables npm sets for the commands it runs', () => {
    vi.stubEnv('npm_config_https_proxy', 'http://npm:2');
    vi.stubEnv('npm_config_proxy', 'http://npm-any:3');

    expect(getProxyForUrl('https://cy.currents.dev')).toBe('');

    vi.stubEnv('HTTPS_PROXY', 'http://env:1');
    vi.stubEnv('npm_config_no_proxy', 'cy.currents.dev');

    expect(getProxyForUrl('https://cy.currents.dev')).toBe('http://env:1');
  });

  it.each([
    ['*', 'https://cy.currents.dev', ''],
    ['cy.currents.dev', 'https://cy.currents.dev', ''],
    ['CY.CURRENTS.DEV', 'https://cy.currents.dev', ''],
    ['other.dev, cy.currents.dev', 'https://cy.currents.dev', ''],
    ['other.dev cy.currents.dev', 'https://cy.currents.dev', ''],
    ['.currents.dev', 'https://cy.currents.dev', ''],
    ['*.currents.dev', 'https://cy.currents.dev', ''],
    ['*currents.dev', 'https://cy.currents.dev', ''],
    ['currents.dev', 'https://cy.currents.dev', 'http://proxy:1'],
    ['cy.currents.dev:443', 'https://cy.currents.dev', ''],
    ['cy.currents.dev:8443', 'https://cy.currents.dev', 'http://proxy:1'],
    ['cy.currents.dev:8443', 'https://cy.currents.dev:8443', ''],
    ['localhost', 'https://127.0.0.1', ''],
    ['127.0.0.1', 'https://localhost', ''],
    ['::1', 'https://localhost', ''],
    ['localhost', 'https://[::1]', ''],
    ['127.0.0.0/8', 'https://127.0.0.1:8443', ''],
    ['10.0.0.0/8', 'https://10.1.2.3', ''],
    ['10.0.0.0/8', 'https://11.1.2.3', 'http://proxy:1'],
    ['192.168.1.5', 'https://[::ffff:192.168.1.5]', ''],
    ['127.1', 'https://127.0.0.1', ''],
    ['cy.currents.dev.', 'https://cy.currents.dev', ''],
    ['*currents.dev', 'https://xcurrents.dev', ''],
    ['', 'https://cy.currents.dev', 'http://proxy:1'],
  ])('NO_PROXY=%j and %s give %j', (noProxy, url, proxy) => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy:1');
    vi.stubEnv('NO_PROXY', noProxy);

    expect(getProxyForUrl(url)).toBe(proxy);
  });

  it('reads NO_PROXY, not npm_config_no_proxy, when both are set', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy:1');
    vi.stubEnv('NO_PROXY', '.corp.test');
    vi.stubEnv('npm_config_no_proxy', 'x.test');

    expect(getProxyForUrl('https://api.corp.test')).toBe('');
  });

  it('reads the lowercase no_proxy before NO_PROXY', () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy:1');
    vi.stubEnv('no_proxy', 'other.dev');
    vi.stubEnv('NO_PROXY', 'cy.currents.dev');

    expect(getProxyForUrl('https://cy.currents.dev')).toBe('http://proxy:1');
  });
});

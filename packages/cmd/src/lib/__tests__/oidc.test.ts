import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  Response,
  startApiServer,
} from '../../test-utils/api-server';
import {
  exchangeOidcToken,
  findTokenSource,
  OidcCredentialKind,
  providedTokenSource,
  revokeOidcCredential,
} from '../oidc';

vi.mock('../../http/httpRetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../http/httpRetry')>()),
  getDelay: () => 1,
}));

const TEST_KIND: OidcCredentialKind = {
  name: 'test credential',
  article: 'a',
  tokenPath: 'test/token',
  revokePath: 'test/revoke',
  prefix: 'test_',
};

const formBody = (request: RecordedRequest) =>
  Object.fromEntries(new URLSearchParams(request.body.toString()));

describe('OIDC exchange', () => {
  let server: ApiServer;
  let tokenResponse: Response;
  let revokeResponse: Response;

  const requestsTo = (path: string) =>
    server.requests.filter((r) => r.url.split('?')[0] === path);

  beforeAll(async () => {
    server = await startApiServer((request) => {
      const path = request.url.split('?')[0];
      if (path === '/github-token') {
        return { status: 200, json: { value: 'github-id-token' } };
      }
      if (path === '/test/token') {
        return tokenResponse;
      }
      if (path === '/test/revoke') {
        return revokeResponse;
      }
      return { status: 404 };
    });
    // The HTTP client reads the base URL once, when it is first used.
    process.env.CURRENTS_API_URL = server.url;
  });

  afterAll(async () => {
    delete process.env.CURRENTS_API_URL;
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    tokenResponse = {
      status: 200,
      json: {
        access_token: 'issued-credential',
        token_type: 'Bearer',
        expires_in: 600,
        scope: 'runs:read projects:read',
      },
    };
    revokeResponse = { status: 200 };
    vi.spyOn(console, 'warn').mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const exchange = () =>
    exchangeOidcToken({
      kind: TEST_KIND,
      source: providedTokenSource('ci-jwt', 'test token'),
      audience: 'test:audience',
      projectId: 'project-1',
    });

  it('posts the token exchange form to the path of the kind', async () => {
    const before = Date.now();

    const result = await exchange();

    expect(result).toEqual({
      credential: 'issued-credential',
      expiresAt: expect.any(String),
      scope: 'runs:read projects:read',
    });
    const expiresAt = Date.parse(result.expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 600_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 600_000);
    const [request] = requestsTo('/test/token');
    expect(request.headers['content-type']).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(formBody(request)).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'ci-jwt',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      project_id: 'project-1',
    });
  });

  it('leaves out the scope when the response has none', async () => {
    tokenResponse = {
      status: 200,
      json: { access_token: 'issued-credential', expires_in: 600 },
    };

    expect(await exchange()).not.toHaveProperty('scope');
  });

  it('exchanges again on every call and does not revoke', async () => {
    await exchange();
    await exchange();

    expect(requestsTo('/test/token')).toHaveLength(2);
    expect(requestsTo('/test/revoke')).toEqual([]);
  });

  it('asks GitHub for a token with the audience it is given', async () => {
    const env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: `${server.url}/github-token?api-version=2.0`,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
    };
    const source = findTokenSource('github-actions', env);
    expect(source).toBeDefined();

    await exchangeOidcToken({
      kind: TEST_KIND,
      source: source!,
      audience: 'currents:api',
      projectId: 'project-1',
      env,
    });

    const [githubRequest] = requestsTo('/github-token');
    const url = new URL(githubRequest.url, server.url);
    expect(url.searchParams.get('audience')).toBe('currents:api');
    expect(formBody(requestsTo('/test/token')[0]).subject_token).toBe(
      'github-id-token'
    );
  });

  it('names the source, the kind and the server error when the exchange fails', async () => {
    tokenResponse = {
      status: 400,
      json: { error: 'invalid_grant', error_description: 'no trust policy' },
    };

    await expect(exchange()).rejects.toThrow(
      'Could not exchange the test token for a test credential: no trust policy'
    );
  });

  it('names the source when getting the token fails', async () => {
    const source = {
      ...providedTokenSource('', 'failing token'),
      getToken: () => Promise.reject(new Error('boom')),
    };

    await expect(
      exchangeOidcToken({
        kind: TEST_KIND,
        source,
        audience: 'a',
        projectId: 'p',
      })
    ).rejects.toThrow('Could not get the failing token: boom');
    expect(server.requests).toEqual([]);
  });

  it('revokes at the revoke path of the kind', async () => {
    await revokeOidcCredential(TEST_KIND, 'issued-credential');

    expect(formBody(requestsTo('/test/revoke')[0])).toEqual({
      token: 'issued-credential',
      token_type_hint: 'access_token',
    });
  });

  it('makes one attempt and throws when the revocation fails', async () => {
    revokeResponse = { status: 500 };

    await expect(
      revokeOidcCredential(TEST_KIND, 'issued-credential')
    ).rejects.toThrow('Could not revoke the test credential');
    expect(requestsTo('/test/revoke')).toHaveLength(1);
  });
});

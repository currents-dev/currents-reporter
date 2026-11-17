const CLOUD_API_URL = 'https://cy.currents.dev';
const CLOUD_REST_API_URL = 'https://api.currents.dev';

export const getAPIBaseUrl = () =>
  process.env.CURRENTS_API_URL ?? CLOUD_API_URL;

export const DEFAULT_OIDC_AUDIENCE = 'currents:record-key';
export const DEFAULT_OIDC_API_AUDIENCE = 'currents:api';

let oidcAudienceOption: string | undefined;

/** Set from `--oidc-audience`. The environment variable is read by `getOidcAudience`. */
export const setOidcAudienceOption = (audience?: string) => {
  oidcAudienceOption = audience;
};

/**
 * The audience of the OIDC tokens: `--oidc-audience`, then
 * CURRENTS_OIDC_AUDIENCE, then `currents:record-key`. A fixed string, not
 * derived from the API URL. Currents staging and on-prem installs use their
 * own value, and the server compares it exactly.
 */
export const getOidcAudience = () =>
  oidcAudienceOption?.trim() ||
  process.env.CURRENTS_OIDC_AUDIENCE?.trim() ||
  DEFAULT_OIDC_AUDIENCE;

/**
 * The REST API, for the requests the director does not serve.
 *
 * Undefined when `CURRENTS_API_URL` points at a director that is not Currents
 * cloud and `CURRENTS_REST_API_URL` is not set: the cloud address would get the
 * record key or API key of that installation.
 */
export const getRestAPIBaseUrl = (): string | undefined => {
  const restApiUrl = process.env.CURRENTS_REST_API_URL?.trim();
  if (restApiUrl) {
    return restApiUrl;
  }
  return isCloudDirector(getAPIBaseUrl()) ? CLOUD_REST_API_URL : undefined;
};

/** The address is compared by origin: a path or a trailing slash does not make it another server. */
function isCloudDirector(apiUrl: string) {
  try {
    return new URL(apiUrl.trim()).origin === CLOUD_API_URL;
  } catch {
    return false;
  }
}

export const requireRestAPIBaseUrl = () => {
  const url = getRestAPIBaseUrl();
  if (!url) {
    throw new Error(
      `CURRENTS_API_URL is not ${CLOUD_API_URL}, so CURRENTS_REST_API_URL is required for this command: set it to the REST API of the same installation, such as your on-prem server or Currents staging. The CLI does not guess its address, because the cloud REST API would receive your keys.`
    );
  }
  return url;
};

export const getTimeout = () => 30000;

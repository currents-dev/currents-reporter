export const getAPIBaseUrl = () =>
  process.env.CURRENTS_API_URL ?? 'https://cy.currents.dev';

/**
 * The audience of the OIDC tokens: the scheme, host and port (unless it is the
 * default) of the API URL, in lowercase and without a path. A token for one
 * Currents deployment is not accepted by another.
 */
export const getOidcAudience = (apiUrl = getAPIBaseUrl()) =>
  new URL(apiUrl).origin;

export const getRestAPIBaseUrl = () =>
  process.env.CURRENTS_REST_API_URL ?? 'https://api.currents.dev';

export const getTimeout = () => 30000;

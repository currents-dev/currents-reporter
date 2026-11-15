export const getAPIBaseUrl = () =>
  process.env.CURRENTS_API_URL ?? 'https://cy.currents.dev';

export const DEFAULT_OIDC_AUDIENCE = 'currents:record-key';

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

export const getRestAPIBaseUrl = () =>
  process.env.CURRENTS_REST_API_URL ?? 'https://api.currents.dev';

export const getTimeout = () => 30000;

export const getAPIBaseUrl = () =>
  process.env.CURRENTS_API_URL ?? 'https://cy.currents.dev';

export const getRestAPIBaseUrl = () =>
  process.env.CURRENTS_REST_API_URL ?? 'https://api.currents.dev';

export const getTimeout = () => 30000;

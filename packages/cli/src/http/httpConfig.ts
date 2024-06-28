export const getAPIBaseUrl = () =>
  process.env.CURRENTS_API_URL ?? "https://cy.currents.dev";

export const getTimeout = () => 30000;

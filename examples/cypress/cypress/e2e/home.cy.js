describe('Home', () => {
  it('shows the title', () => {
    cy.visit('app/index.html');
    cy.get('h1').should('have.text', 'Demo app');
  });
});

it('runs a test outside a describe block', () => {
  cy.visit('app/index.html');
  cy.title().should('eq', 'Demo app');
});

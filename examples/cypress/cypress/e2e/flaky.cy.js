describe('Flaky', () => {
  // Fails on the first attempt and passes on the retry
  it('passes on the second attempt', () => {
    cy.visit('app/index.html');
    cy.get('h1').should(
      'have.text',
      Cypress.currentRetry === 0 ? 'Wrong title' : 'Demo app'
    );
  });
});

describe('Login', () => {
  beforeEach(() => {
    cy.visit('app/index.html');
  });

  it('shows a welcome message', () => {
    cy.get('[name=email]').type('jane@example.com');
    cy.get('button').click();
    cy.get('#message').should('have.text', 'Welcome, jane@example.com');
  });

  it('asks for an email', () => {
    cy.get('button').click();
    cy.get('#message').should('have.text', 'Email is required');
  });

  // Fails on purpose: the demo shows a failure with a screenshot
  it('remembers the user', () => {
    cy.get('[name=email]').type('jane@example.com');
    cy.get('button').click();
    cy.get('#message').should('contain.text', 'Welcome back');
  });

  describe('password', () => {
    it('hides the password', () => {
      cy.get('[name=password]').should('have.attr', 'type', 'password');
    });

    it.skip('shows a strength meter', () => {});
  });
});

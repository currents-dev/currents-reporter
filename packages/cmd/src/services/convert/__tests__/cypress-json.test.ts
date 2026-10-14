import { describe, expect, it } from 'vitest';
import { getInstanceMap } from '../cypress-json';
import { CypressRunResult } from '../cypress-json/types';
import results from './fixtures/cypress-results.json';

const instances = Array.from(
  getInstanceMap([results as CypressRunResult]).values()
);
const getInstance = (spec: string) =>
  instances.find((instance) => instance.spec === spec)!;
const getTest = (spec: string, title: string) =>
  getInstance(spec).results.tests.find(
    (test) => test.title[test.title.length - 1] === title
  )!;

describe('getInstanceMap for Cypress run results', () => {
  it('creates one spec for each spec file, with the full test titles', () => {
    expect(instances.map(({ groupId, spec }) => ({ groupId, spec }))).toEqual([
      { groupId: 'electron', spec: 'cypress/e2e/flaky.cy.js' },
      { groupId: 'electron', spec: 'cypress/e2e/home.cy.js' },
      { groupId: 'electron', spec: 'cypress/e2e/login.cy.js' },
    ]);
    expect(
      getTest('cypress/e2e/login.cy.js', 'hides the password').title
    ).toEqual(['Login', 'password', 'hides the password']);
  });

  it('keeps every attempt, with the error on the last failed attempt', () => {
    const test = getTest('cypress/e2e/login.cy.js', 'remembers the user');

    expect(test.state).toBe('failed');
    expect(test.retries).toBe(2);
    expect(test.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'failed',
      'failed',
    ]);
    expect(test.attempts.map((attempt) => attempt.error?.value)).toEqual([
      undefined,
      undefined,
      'AssertionError',
    ]);
  });

  it('marks a test that passed on a retry as flaky', () => {
    const test = getTest(
      'cypress/e2e/flaky.cy.js',
      'passes on the second attempt'
    );

    expect(test.isFlaky).toBe(true);
    expect(test.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'passed',
    ]);
    expect(getInstance('cypress/e2e/flaky.cy.js').results.stats.flaky).toBe(1);
  });

  it('attaches each screenshot and the video of the spec to the failed attempts', () => {
    const test = getTest('cypress/e2e/login.cy.js', 'remembers the user');

    expect(
      test.attempts.map((attempt) =>
        attempt.artifacts?.map(({ type, path }) => ({ type, path }))
      )
    ).toEqual(
      [
        'Login -- remembers the user (failed).png',
        'Login -- remembers the user (failed) (attempt 2).png',
        'Login -- remembers the user (failed) (attempt 3).png',
      ].map((screenshot) => [
        {
          type: 'screenshot',
          path: `cypress/screenshots/login.cy.js/${screenshot}`,
        },
        { type: 'video', path: 'cypress/videos/login.cy.js.mp4' },
      ])
    );
  });

  it('keeps the video of a spec without failed attempts at the spec level', () => {
    expect(getInstance('cypress/e2e/home.cy.js').artifacts).toEqual([
      expect.objectContaining({
        type: 'video',
        path: 'cypress/videos/home.cy.js.mp4',
      }),
    ]);
  });

  it('records a skipped test as pending', () => {
    const test = getTest('cypress/e2e/login.cy.js', 'shows a strength meter');

    expect(test.state).toBe('pending');
    expect(test.attempts[0].status).toBe('skipped');
  });
});

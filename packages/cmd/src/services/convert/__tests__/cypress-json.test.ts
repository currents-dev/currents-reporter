import fs from 'fs-extra';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseStringPromise } from 'xml2js';
import { getInstanceMap as getJUnitInstanceMap } from '../cypress';
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

  it('gives a test the same ID as the JUnit report of the same spec', async () => {
    const junit = await parseStringPromise(
      fs.readFileSync(join(__dirname, 'fixtures/junit/cypress.xml'), 'utf-8'),
      { explicitArray: false, mergeAttrs: true }
    );
    const [junitLogin] = (await getJUnitInstanceMap([junit])).values();
    const getTestIds = (spec: typeof junitLogin) =>
      spec.results.tests.map((test) => test.testId);

    expect(getTestIds(getInstance('cypress/e2e/login.cy.js'))).toEqual(
      getTestIds(junitLogin)
    );
  });

  it('fails when a spec file is in the results more than once', () => {
    expect(() =>
      getInstanceMap([results as CypressRunResult, results as CypressRunResult])
    ).toThrow(
      'The results have cypress/e2e/flaky.cy.js in electron more than once'
    );
  });

  it('skips a spec file that failed to load', () => {
    const [run] = (results as CypressRunResult).runs;
    const broken = {
      ...run,
      spec: { ...run.spec, relative: 'cypress/e2e/broken.cy.js' },
      tests: [],
      error: 'Oops...we found an error preparing this test file:',
    };

    const map = getInstanceMap([
      { ...(results as CypressRunResult), runs: [broken] },
    ]);

    expect(map.size).toBe(0);
  });
});

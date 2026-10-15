import fs from 'fs-extra';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStringPromise } from 'xml2js';
import { getInstanceMap } from '../cypress/instances';

const parse = (xml: string) =>
  parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });

const getInstances = async (...xml: string[]) =>
  Array.from(
    (await getInstanceMap(await Promise.all(xml.map(parse)))).values()
  );

const loginReport = fs.readFileSync(
  join(__dirname, 'fixtures/junit/cypress.xml'),
  'utf-8'
);

const homeReport = `
<testsuites name="e2e" time="0.071" tests="2" failures="0">
  <testsuite name="Root Suite" timestamp="2026-10-13T16:06:03" tests="1" file="cypress/e2e/home.cy.js" time="0.000" failures="0">
    <testcase name="runs a test outside a describe block" time="0.038" classname="runs a test outside a describe block">
    </testcase>
  </testsuite>
  <testsuite name="Home" timestamp="2026-10-13T16:06:03" tests="1" time="0.028" failures="0">
    <testcase name="Home shows the title" time="0.021" classname="shows the title">
    </testcase>
  </testsuite>
</testsuites>`;

describe('getInstanceMap for Cypress', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates one spec for each report, with the tests of all its describe blocks', async () => {
    const instances = await getInstances(loginReport, homeReport);

    expect(
      instances.map(({ groupId, spec, results }) => ({
        groupId,
        spec,
        stats: results.stats,
      }))
    ).toEqual([
      {
        groupId: 'e2e',
        spec: 'cypress/e2e/login.cy.js',
        stats: expect.objectContaining({
          tests: 5,
          passes: 3,
          failures: 1,
          pending: 1,
          wallClockDuration: 4973,
        }),
      },
      {
        groupId: 'e2e',
        spec: 'cypress/e2e/home.cy.js',
        stats: expect.objectContaining({ tests: 2, passes: 2 }),
      },
    ]);
  });

  it('splits the describe block titles from the test title', async () => {
    const [login, home] = await getInstances(loginReport, homeReport);

    expect(
      [login, home].flatMap((instance) =>
        instance.results.tests.map(({ title, state, location }) => ({
          title,
          state,
          file: location.file,
        }))
      )
    ).toEqual([
      {
        title: ['Login', 'shows a welcome message'],
        state: 'passed',
        file: 'cypress/e2e/login.cy.js',
      },
      {
        title: ['Login', 'asks for an email'],
        state: 'passed',
        file: 'cypress/e2e/login.cy.js',
      },
      {
        title: ['Login', 'remembers the user'],
        state: 'failed',
        file: 'cypress/e2e/login.cy.js',
      },
      {
        title: ['Login password', 'hides the password'],
        state: 'passed',
        file: 'cypress/e2e/login.cy.js',
      },
      {
        title: ['Login password', 'shows a strength meter'],
        state: 'pending',
        file: 'cypress/e2e/login.cy.js',
      },
      {
        title: ['runs a test outside a describe block'],
        state: 'passed',
        file: 'cypress/e2e/home.cy.js',
      },
      {
        title: ['Home', 'shows the title'],
        state: 'passed',
        file: 'cypress/e2e/home.cy.js',
      },
    ]);
  });

  it('reads the report timestamps as UTC', async () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const [home] = await getInstances(homeReport);

    expect(home.startTime).toBe('2026-10-13T16:06:03.000Z');
    expect(home.results.stats.wallClockEndedAt).toBe(
      '2026-10-13T16:06:03.071Z'
    );
  });

  it('keeps the test IDs when the same report is converted again', async () => {
    const getTestIds = async () =>
      (await getInstances(loginReport))[0].results.tests.map((t) => t.testId);

    expect(await getTestIds()).toEqual(await getTestIds());
    expect(new Set(await getTestIds()).size).toBe(5);
  });

  it('creates one spec for each describe block when the report has no spec file', async () => {
    const instances = await getInstances(
      homeReport.replace(' file="cypress/e2e/home.cy.js"', '')
    );

    expect(instances.map(({ spec }) => spec)).toEqual(['Root Suite', 'Home']);
  });
});

import { warn } from '@logger';
import { readJson } from 'fs-extra';
import { basename, relative } from 'path';
import {
  Artifact,
  ErrorSchema,
  InstanceReport,
  InstanceReportTest,
  InstanceReportTestAttempt,
  TestCaseStatus,
  TestRunnerStatus,
} from '../../../types';
import { generateCypressTestId } from '../utils';
import {
  CypressRunResult,
  CypressSpecRun,
  CypressTest,
  CypressTestState,
} from './types';

export async function readCypressResults(
  inputFiles: string[]
): Promise<CypressRunResult[]> {
  return Promise.all(
    inputFiles.map(async (file) => {
      const result = await readJson(file);
      if (!Array.isArray(result?.runs)) {
        throw new Error(
          `${file} is not a Cypress run result: it has no "runs" list. Save the results of the "after:run" event or of cypress.run().`
        );
      }
      return result;
    })
  );
}

export function getInstanceMap(
  results: CypressRunResult[]
): Map<string, InstanceReport> {
  const instances: Map<string, InstanceReport> = new Map();

  for (const result of results) {
    for (const run of result.runs) {
      if (run.tests.length === 0) {
        // A spec file that fails to load, e.g. with a syntax error
        if (run.error) {
          warn(
            'Skipping %s, Cypress could not load it and it has no test results: %s',
            run.spec.relative,
            getErrorLine(run.error)
          );
        }
        continue;
      }
      const instance = getInstance(run, result.browserName);
      const key = `${instance.groupId}${instance.spec}`;
      if (instances.has(key)) {
        throw new Error(
          `The results have ${instance.spec} in ${instance.groupId} more than once. Upload the results of each spec file once: split the spec files between the machines, or upload the files of each run with its own --ci-build-id.`
        );
      }
      instances.set(key, instance);
    }
  }

  return instances;
}

function getInstance(run: CypressSpecRun, groupId: string): InstanceReport {
  const spec = run.spec.relative;
  // Cypress writes absolute paths. Relative to the Cypress project, they also
  // resolve when the upload runs in another checkout of the project.
  const projectRoot = run.spec.absolute.slice(0, -spec.length);
  const toProjectPath = (path: string) => relative(projectRoot, path);

  const screenshots = run.screenshots.map((screenshot) => ({
    ...screenshot,
    path: toProjectPath(screenshot.path),
  }));
  const specArtifacts: Artifact[] = [];

  let startTime = new Date(run.stats.startedAt).getTime();
  const tests = run.tests.map((test) => {
    const reportTest = getTest(test, spec, startTime);
    startTime += test.duration;
    return reportTest;
  });

  for (const screenshot of screenshots) {
    const artifact: Artifact = {
      path: screenshot.path,
      type: 'screenshot',
      contentType: 'image/png',
      name: basename(screenshot.path),
    };
    const match = matchScreenshot(screenshot.path, run.tests);
    const attempt = match && tests[match.testIndex].attempts[match.attempt];
    if (attempt) {
      attempt.artifacts = [...(attempt.artifacts ?? []), artifact];
    } else {
      specArtifacts.push(artifact);
    }
  }

  if (run.video) {
    const video: Artifact = {
      path: toProjectPath(run.video),
      type: 'video',
      contentType: 'video/mp4',
      name: basename(run.video),
    };
    // The API stores a spec-level video but does not show it, so the video
    // goes to the failed attempts, where the dashboard shows it
    const failedAttempts = tests
      .flatMap((test) => test.attempts)
      .filter((attempt) => attempt.status === 'failed');
    for (const attempt of failedAttempts) {
      attempt.artifacts = [...(attempt.artifacts ?? []), { ...video }];
    }
    if (failedAttempts.length === 0) {
      specArtifacts.push(video);
    }
  }

  return {
    groupId,
    spec,
    startTime: run.stats.startedAt,
    artifacts: specArtifacts,
    results: {
      stats: {
        suites: run.stats.suites,
        tests: run.stats.tests,
        passes: run.stats.passes,
        pending: run.stats.pending,
        skipped: run.stats.skipped,
        failures: run.stats.failures,
        flaky: tests.filter((test) => test.isFlaky).length,
        wallClockStartedAt: run.stats.startedAt,
        wallClockEndedAt: run.stats.endedAt,
        wallClockDuration: run.stats.duration,
      },
      tests,
    },
  };
}

function getTest(
  test: CypressTest,
  spec: string,
  startTime: number
): InstanceReportTest {
  // Cypress reports one duration for all attempts of a test
  const attemptDuration = Math.round(test.duration / test.attempts.length);
  const lastFailedAttempt = test.attempts
    .map((attempt) => attempt.state)
    .lastIndexOf('failed');

  const attempts = test.attempts.map(
    (attempt, index): InstanceReportTestAttempt => {
      // Cypress keeps the error of the last failed attempt only
      const errors =
        index === lastFailedAttempt && test.displayError
          ? [getError(test.displayError)]
          : [];
      return {
        _s: getTestCaseStatus(attempt.state),
        attempt: index,
        startTime: new Date(startTime + index * attemptDuration).toISOString(),
        steps: [],
        duration: attemptDuration,
        status: getRunnerStatus(attempt.state),
        artifacts: [],
        errors,
        error: errors[0],
      };
    }
  );

  return {
    _t: startTime,
    testId: generateCypressTestId(test.title, spec),
    title: test.title,
    state: getTestCaseStatus(test.state),
    isFlaky:
      test.state === 'passed' &&
      test.attempts.some((attempt) => attempt.state === 'failed'),
    retries: test.attempts.length - 1,
    expectedStatus: 'passed',
    timeout: 0,
    location: { file: spec, line: 1, column: 1 },
    artifacts: [],
    attempts,
  };
}

/**
 * Cypress names a screenshot of a failure
 * "<spec folder>/<title 1> -- <title 2> (failed) (attempt <n>).png", without
 * " (attempt 1)" for the first attempt. Screenshots that `cy.screenshot()`
 * names do not match a test.
 */
function matchScreenshot(path: string, tests: CypressTest[]) {
  const match = basename(path, '.png').match(
    /^(.*?)(?: \(failed\))?(?: \(attempt (\d+)\))?$/
  );
  if (!match) return null;
  const [, titles, attemptNumber] = match;
  const testIndex = tests.findIndex(
    (test) => test.title.join(' -- ') === titles
  );
  if (testIndex === -1) return null;
  return { testIndex, attempt: attemptNumber ? Number(attemptNumber) - 1 : 0 };
}

// Cypress starts the error of a spec file it could not load with
// "Oops...we found an error preparing this test file", then names the error
function getErrorLine(error: string) {
  const lines = error.split('\n').map((line) => line.trim());
  return lines.find((line) => /^\w*Error\b/.test(line)) ?? lines[0];
}

// "AssertionError: Timed out ...\n    at ..." to its type, message and stack
function getError(displayError: string): ErrorSchema {
  const [firstLine] = displayError.split('\n');
  const match = firstLine.match(/^(\w*Error): (.*)$/);
  return {
    message: match ? match[2] : firstLine,
    value: match?.[1],
    stack: displayError,
  };
}

function getTestCaseStatus(state: CypressTestState): TestCaseStatus {
  return state === 'passed' || state === 'failed' ? state : 'pending';
}

function getRunnerStatus(state: CypressTestState): TestRunnerStatus {
  return state === 'passed' || state === 'failed' ? state : 'skipped';
}

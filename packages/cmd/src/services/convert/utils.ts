import { isNumber } from 'lodash';
import crypto from 'node:crypto';
import {
  Artifact,
  ErrorSchema,
  InstanceReportTest,
  InstanceReportTestAttempt,
  TestCaseStatus,
  TestRunnerStatus,
} from '../../types';
import { Failure, Property, TestCase, TestSuite } from './types';

export function getTestCase(
  testCase: TestCase,
  suite: TestSuite,
  time: number,
  suiteName: string
): InstanceReportTest {
  const failures = ensureArray<string | Failure>(testCase.failure);
  const hasFailure = failures.length > 0;
  const suiteTimestamp = suite?.timestamp ?? '';
  const skipped = 'skipped' in testCase;

  const state = skipped ? 'pending' : hasFailure ? 'failed' : 'passed';

  const { testArtifacts, attemptArtifacts } = getTestAndAttemptArtifacts(testCase);

  return {
    _t: getTimestampValue(suiteTimestamp),
    testId: generateTestId(
      getTestTitle(testCase.name, suiteName).join(', '),
      suiteName
    ),
    title: getTestTitle(testCase.name, suiteName),
    state: state,
    isFlaky: getTestFlakiness(),
    expectedStatus: 'passed',
    timeout: getTimeout(),
    location: getTestCaseLocation(suite?.file ?? ''),
    retries: getTestRetries(failures),
    artifacts: testArtifacts,
    attempts: getTestAttempts(
      testCase,
      failures,
      getISODateValue(suiteTimestamp),
      time,
      attemptArtifacts,
      skipped
    ),
  };
}

export function getSpecArtifacts(suite: TestSuite): Artifact[] {
  // Properties can be nested in <properties> or direct children of <testsuite>
  const properties = ensureArray<Property>(suite.properties?.property ?? (suite as any).property);
  return parseArtifacts(properties, 'currents.artifact.instance.', 'spec');
}

function getTestAndAttemptArtifacts(testCase: TestCase): {
  testArtifacts: Artifact[];
  attemptArtifacts: Map<number, Artifact[]>;
} {
  const properties = ensureArray<Property>(testCase.properties?.property);
  const testArtifacts = parseArtifacts(properties, 'currents.artifact.test.', 'test');
  const attemptArtifacts = new Map<number, Artifact[]>();

  // Parse explicitly indexed artifacts from testCase properties
  const indexedArtifactsMap = parseIndexedAttemptArtifacts(properties);
  indexedArtifactsMap.forEach((artifacts, index) => {
    if (!attemptArtifacts.has(index)) {
      attemptArtifacts.set(index, []);
    }
    attemptArtifacts.get(index)!.push(...artifacts);
  });

  // Parse unindexed artifacts from testCase properties (assigned to attempt 0)
  const defaultArtifacts = parseArtifacts(properties, 'currents.artifact.attempt.', 'attempt');
  if (defaultArtifacts.length > 0) {
    if (!attemptArtifacts.has(0)) {
      attemptArtifacts.set(0, []);
    }
    attemptArtifacts.get(0)!.push(...defaultArtifacts);
  }

  return { testArtifacts, attemptArtifacts };
}

function parseIndexedAttemptArtifacts(properties: Property[]): Map<number, Artifact[]> {
  const result = new Map<number, Artifact[]>();
  const regex = /^currents\.artifact\.attempt\.(\d+)\.(.+)$/;
  
  // Group properties by attempt index
  const attemptProperties = new Map<number, Property[]>();
  
  for (const prop of properties) {
    if (!prop.name || !prop.value) continue;
    const match = prop.name.match(regex);
    if (!match) continue;
    
    const [, indexStr, key] = match;
    const index = parseInt(indexStr, 10);
    
    if (!attemptProperties.has(index)) {
      attemptProperties.set(index, []);
    }
    
    attemptProperties.get(index)!.push({
      name: `currents.artifact.attempt.${key}`,
      value: prop.value
    });
  }
  
  for (const [index, props] of attemptProperties.entries()) {
    const artifacts = parseArtifacts(props, 'currents.artifact.attempt.', 'attempt');
    if (artifacts.length > 0) {
      result.set(index, artifacts);
    }
  }
  
  return result;
}

function parseArtifacts(properties: Property[], prefix: string, level: Artifact['level']): Artifact[] {
  const artifacts: Artifact[] = [];
  let currentArtifact: Partial<Artifact> = {};

  for (const prop of properties) {
    if (!prop.name || !prop.value) continue;
    if (!prop.name.startsWith(prefix)) continue;

    const key = prop.name.slice(prefix.length);
    // Valid keys: path, type, contentType, name
    // Also ignore keys that start with a number (indexed artifacts handled separately)
    if (/^\d+\./.test(key)) continue; 
    
    if (!['path', 'type', 'contentType', 'name'].includes(key)) continue;

    // If key already exists in current artifact, it means we are starting a new artifact
    // (assuming properties are grouped by artifact)
    if (currentArtifact[key as keyof Artifact]) {
      if (isValidArtifact(currentArtifact)) {
        artifacts.push({ ...currentArtifact, level } as Artifact);
      }
      currentArtifact = {};
    }

    (currentArtifact as any)[key] = prop.value;
  }

  // Push the last artifact
  if (isValidArtifact(currentArtifact)) {
    artifacts.push({ ...currentArtifact, level } as Artifact);
  }

  return artifacts;
}

function isValidArtifact(a: Partial<Artifact>): boolean {
  return !!(a.path && a.type && a.contentType);
}


export function generateTestId(testName: string, suiteName: string): string {
  const combinedString = `${testName}${suiteName}`;
  const fullHash = crypto
    .createHash('sha256')
    .update(combinedString)
    .digest('hex');
  return fullHash.substring(0, 16);
}

export function getTimestampValue(dateString: string) {
  if (!isValidDate(dateString)) {
    return new Date().getTime();
  }
  return new Date(dateString).getTime();
}

export function getISODateValue(dateString: string) {
  if (!isValidDate(dateString)) {
    return new Date().toISOString();
  }
  return new Date(dateString).toISOString();
}

function isValidDate(dateString: string) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export function getTestTitle(testName?: string, suiteName?: string): string[] {
  return [suiteName, testName].filter(Boolean) as string[];
}

function getTestFlakiness() {
  // The attempts concept has not been seen in the JUnit frameworks we tried so there's always a single attempt
  // No way to determine flakiness so far
  return false;
}

function getTimeout() {
  // No timeout property has been found in the example frameworks
  // The only way to determine a timeout is looking in the failure but is not very consistent way
  return 0;
}

function getTestCaseLocation(fileName: string) {
  // No way to determine column and line properties of a test in spec file
  return {
    column: 1,
    file: fileName,
    line: 1,
  };
}

function getTestRetries(failures: (Failure | string)[]) {
  // We can know the retries based on the failure tags in testcase
  // But if the final outcome of the retries is passed, then all the failure tags will be gone
  let retries = 0;
  failures.forEach((item) => {
    if (typeof item !== 'string') {
      retries++;
    }
  });
  return retries;
}

/**
 * Transforms a TestCase object into an array of InstanceReportTestAttempt objects.
 * 
 * This function processes a TestCase (which may represent a single test execution or a set of retries/failures)
 * and generates a list of attempts suitable for the Currents dashboard.
 * 
 * It handles:
 * - Skipped tests: Returns a single "skipped" attempt.
 * - Passed tests: Returns a single "passed" attempt if there are no failures.
 * - Failed tests: Iterates over the failures to create multiple "failed" attempts, mapping errors and artifacts.
 * 
 * @param testCase - The source TestCase object from the test report.
 * @param failures - A list of failure objects or strings associated with the test case.
 * @param suiteTimestamp - The timestamp of the test suite start.
 * @param time - The duration or specific time associated with the test case.
 * @param attemptArtifacts - A map of artifacts keyed by attempt index.
 * @param skipped - Whether the test case was skipped.
 * @returns An array of InstanceReportTestAttempt objects representing the test execution(s).
 */
function getTestAttempts(
  testCase: TestCase,
  failures: (Failure | string)[],
  suiteTimestamp: string,
  time: number,
  attemptArtifacts: Map<number, Artifact[]>,
  skipped?: boolean
): InstanceReportTestAttempt[] {
  const testCaseTime = testCase.time ? timeToMilliseconds(testCase.time) : 0;
  if (skipped) {
    return [
      {
        _s: 'pending',
        attempt: 0,
        startTime: suiteTimestamp,
        steps: [],
        duration: testCaseTime,
        status: 'skipped',
        stdout: getStdOut(testCase?.['system-out']),
        stderr: getStdErr(testCase?.['system-err']),
        artifacts: attemptArtifacts.get(0),
        errors: [],
        error: undefined,
      },
    ];
  }
  if (failures.length === 0) {
    // If no failures (passed), assign all discovered artifacts to attempt 0
    // regardless of their index, because there is only 1 attempt.
    const allArtifacts: Artifact[] = [];
    attemptArtifacts.forEach((artifacts) => {
      allArtifacts.push(...artifacts);
    });

    return [
      {
        _s: 'passed',
        attempt: 0,
        startTime: suiteTimestamp,
        steps: [],
        duration: testCaseTime,
        status: 'passed',
        stdout: getStdOut(testCase?.['system-out']),
        stderr: getStdErr(testCase?.['system-err']),
        artifacts: allArtifacts,
        errors: [],
        error: undefined,
      },
    ];
  }

  return failures.reduce<InstanceReportTestAttempt[]>(
    (attempts, failure, index) => {
      if (failure !== 'true' && failure !== 'false') {
        const errors = getErrors(failure);
        
        // In JUnit XML, `system-out` and `system-err` are typically associated with the `testcase` node,
        // not individual failures/attempts. This means we only have one set of logs for the entire test case execution.
        // Since we cannot distinguish which attempt produced which log, we attach the available logs to every attempt derived from this test case.
        // This ensures that regardless of which attempt is viewed in the dashboard, the user sees the logs associated with the test case.
        
        attempts.push({
          _s: 'failed' as TestCaseStatus,
          attempt: index,
          startTime: getTestStartTime(time, suiteTimestamp),
          steps: [],
          duration: testCaseTime,
          status: 'failed' as TestRunnerStatus,
          stdout: getStdOut(testCase?.['system-out']),
          stderr: getStdErr(testCase?.['system-err']),
          artifacts: attemptArtifacts.get(index),
          errors: errors,
          error: errors[0],
        });
      }
      return attempts;
    },
    []
  );
}

function getStdOut(systemOut?: string) {
  return systemOut ? [systemOut] : [];
}

function getStdErr(systemErr?: string) {
  return systemErr ? [systemErr] : [];
}

function getErrors(failure: Failure | string): ErrorSchema[] {
  if (failure === 'true' || failure === 'false') {
    return [];
  }

  const error: ErrorSchema =
    typeof failure === 'string'
      ? { message: failure }
      : { message: failure.message, stack: failure._, value: failure.type };

  return [error];
}

function getTestStartTime(accTestTime: number, suiteTimestamp: string): string {
  const newStartTime = getTimestampValue(suiteTimestamp) + accTestTime;
  return new Date(newStartTime).toISOString();
}

export function ensureArray<T>(value: unknown): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value] as T[];
}

export function secondsToMilliseconds(seconds: number) {
  return Math.round(seconds * 1000);
}

export function timeToMilliseconds(time: string): number {
  const parsedTime = parseFloat(time);
  if (isNaN(parsedTime)) {
    return 0;
  }
  return secondsToMilliseconds(parsedTime);
}

/**
 * Generates a unique suite name based on the provided suite and allSuites array.
 * The priority for the suite name is as follows:
 * 1. `file` property of the suite.
 * 2. `name` property of the suite.
 * 3. `id` property of the suite.
 * 4. If none of the above properties are available, it returns 'unknown'.
 *
 * If there are duplicates in the `allSuites` array based on the selected property,
 * it appends the `id` or `index` to the suite name to ensure uniqueness.
 *
 * @param suite - The test suite object.
 * @param allSuites - Array of all test suites.
 * @param index - Optional index to include in the suite name for uniqueness.
 * @returns The generated suite name.
 */
export function getSuiteName(
  suite: TestSuite,
  allSuites: TestSuite[],
  index?: number
) {
  const includeIndex = isNumber(index) && index > 0;
  const hasDuplicateId = !!suite.id && hasDuplicate(allSuites, 'id', suite.id);

  if (suite.file) {
    const hasDuplicateFile = hasDuplicate(allSuites, 'file', suite.file);

    if (hasDuplicateFile && !hasDuplicateId) {
      return `${suite.file} - ${suite.id}`;
    }
    if (hasDuplicateFile && includeIndex) {
      return `${suite.file} - ${index}`;
    }
    return suite.file;
  }

  if (suite.name) {
    const hasDuplicateName = hasDuplicate(allSuites, 'name', suite.name);

    if (hasDuplicateName && !hasDuplicateId) {
      return `${suite.name} - ${suite.id}`;
    }
    if (hasDuplicateName && includeIndex) {
      return `${suite.name} - ${index}`;
    }
    return suite.name;
  }

  if (suite.id) {
    if (hasDuplicateId && includeIndex) {
      return `${suite.id} - ${index}`;
    }
    return suite.id;
  }

  if (includeIndex) {
    return `unknown - ${index}`;
  }
  return 'unknown';
}

function hasDuplicate<T>(arr: T[], property: string, value: unknown) {
  const filtered = arr.filter(
    (obj) => (obj as Record<string, unknown>)[property] === value
  );
  return filtered.length > 1;
}

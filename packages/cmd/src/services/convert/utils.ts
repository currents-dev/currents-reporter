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

// Constants
const JSON_ARTIFACT_KEY = 'currents.artifact.JSON_ARTIFACT';
const ARTIFACT_FIELDS = ['path', 'type', 'contentType', 'name'];

// Extension sets
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const ATTACHMENT_EXTENSIONS = new Set(['json', 'txt', 'log', 'xml']);

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
  const properties = ensureArray<Property>(suite.properties?.property);
  return parseArtifactsFromProperties(properties, 'spec');
}

function getTestAndAttemptArtifacts(testCase: TestCase): {
  testArtifacts: Artifact[];
  attemptArtifacts: Map<number, Artifact[]>;
} {
  const properties = ensureArray<Property>(testCase.properties?.property);
  let testArtifacts = parseArtifactsFromProperties(properties, 'test');
  let attemptArtifacts = parseAttemptArtifactsFromProperties(properties);

  if (testCase['system-out']) {
    const stdouts = ensureArray<string>(testCase['system-out']);
    const stdout = stdouts.join('\n');
    const stdoutArtifacts = extractArtifactsFromLog(stdout);

    stdoutArtifacts.forEach((artifact) => {
      if (artifact.level === 'attempt') {
        if (!attemptArtifacts.has(0)) {
          attemptArtifacts.set(0, []);
        }
        attemptArtifacts.get(0)!.push({ ...artifact });
      } else {
        // level is 'test' or undefined
        testArtifacts.push({ ...artifact });
      }
    });
  }

  return { testArtifacts, attemptArtifacts };
}

export function extractArtifactsFromLog(log: string): Artifact[] {
  const artifacts: Artifact[] = [];
  
  // Format: [[CURRENTS.ATTACHMENT|path]] or [[CURRENTS.ATTACHMENT|path|level]]
  const matches = log.matchAll(/\[\[CURRENTS\.ATTACHMENT\|([^|\]]+)(?:\|([^\]]+))?\]\]/g);
  for (const match of matches) {
    const sourcePath = match[1].trim();
    const levelRaw = match[2]?.trim();
    
    // Default level is 'attempt' unless specified otherwise
    let level: 'spec' | 'test' | 'attempt' = 'attempt';
    if (levelRaw && ['spec', 'test', 'attempt'].includes(levelRaw)) {
      level = levelRaw as 'spec' | 'test' | 'attempt';
    }

    artifacts.push({
        path: sourcePath,
        type: inferArtifactType(sourcePath), // Use helper function
        contentType: 'application/octet-stream', // Default content type
        level: level
    });
  }

  const jsonMatches = log.matchAll(/currents\.artifact\.(\{.*?\})/g);
  for (const match of jsonMatches) {
    try {
        const artifact = JSON.parse(match[1]);
        if (isValidArtifact(artifact)) {
            artifacts.push(artifact);
        }
    } catch (e) {}
  }

  return artifacts;
}

function inferArtifactType(filePath: string): Artifact['type'] {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return 'attachment';
  
  if (IMAGE_EXTENSIONS.has(ext)) return 'screenshot';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (ATTACHMENT_EXTENSIONS.has(ext)) return 'attachment';
  
  return 'attachment';
}

function isValidArtifact(a: Partial<Artifact>): boolean {
  return !!(a.path && a.type && a.contentType);
}

function parseArtifactsFromProperties(properties: Property[], level: 'spec' | 'test'): Artifact[] {
  const artifactMap = new Map<number, Partial<Artifact>>();
  const jsonArtifacts: Artifact[] = [];
  const regex = new RegExp(`^currents\\.artifact\\.${level}\\.(\\d+)\\.(.+)$`);

  for (const prop of properties) {
    parseSingleProperty(prop, regex, artifactMap, jsonArtifacts);
  }

  const indexedArtifacts = Array.from(artifactMap.values())
    .filter((a) => isValidArtifact(a) && a.type !== 'stdout' && a.type !== 'stderr') as Artifact[];

  return [...indexedArtifacts, ...jsonArtifacts];
}

function parseSingleProperty(
  prop: Property, 
  regex: RegExp, 
  artifactMap: Map<number, Partial<Artifact>>,
  jsonArtifacts?: Artifact[]
) {
  if (!prop.name || !prop.value) return;

  if (prop.name === JSON_ARTIFACT_KEY) {
    if (jsonArtifacts) {
      try {
        const artifact = JSON.parse(prop.value);
        if (isValidArtifact(artifact)) {
          jsonArtifacts.push(artifact);
        }
      } catch (e) {}
    }
    return;
  }

  const match = prop.name.match(regex);
  if (!match) return;

  const [, indexStr, field] = match;
  const index = parseInt(indexStr, 10);

  if (!artifactMap.has(index)) {
    artifactMap.set(index, {});
  }

  const artifact = artifactMap.get(index)!;
  if (ARTIFACT_FIELDS.includes(field)) {
    (artifact as any)[field] = prop.value;
  }
}

function parseAttemptArtifactsFromProperties(properties: Property[]): Map<number, Artifact[]> {
  const attemptArtifactsMap = new Map<number, Map<number, Partial<Artifact>>>();

  for (const prop of properties) {
    // We can reuse logic but we need to handle the double index for attempts
    if (!prop.name || !prop.value) continue;
    if (prop.name === JSON_ARTIFACT_KEY) continue;

    const match = prop.name.match(/^currents\.artifact\.attempt\.(\d+)\.(\d+)\.(.+)$/);
    if (!match) continue;

    const [, attemptIndexStr, artifactIndexStr, field] = match;
    const attemptIndex = parseInt(attemptIndexStr, 10);
    const artifactIndex = parseInt(artifactIndexStr, 10);

    if (!attemptArtifactsMap.has(attemptIndex)) {
      attemptArtifactsMap.set(attemptIndex, new Map());
    }
    
    // Reuse parseSingleProperty logic by delegating to the inner map?
    // Not strictly straightforward because parseSingleProperty expects a regex match that returns [full, index, field]
    // Here we have [full, attemptIndex, artifactIndex, field]
    
    const artifactsMap = attemptArtifactsMap.get(attemptIndex)!;
    if (!artifactsMap.has(artifactIndex)) {
      artifactsMap.set(artifactIndex, {});
    }

    const artifact = artifactsMap.get(artifactIndex)!;
    if (ARTIFACT_FIELDS.includes(field)) {
      (artifact as any)[field] = prop.value;
    }
  }

  const result = new Map<number, Artifact[]>();
  for (const [attemptIndex, artifactsMap] of attemptArtifactsMap.entries()) {
    const artifacts = Array.from(artifactsMap.values())
      .filter((a) => isValidArtifact(a) && a.type !== 'stdout' && a.type !== 'stderr') as Artifact[];
    if (artifacts.length > 0) {
      result.set(attemptIndex, artifacts);
    }
  }
  return result;
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
        artifacts: attemptArtifacts.get(0),
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

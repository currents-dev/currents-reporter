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
    
    // Add to test artifacts
    testArtifacts.push(...stdoutArtifacts);
    
    // Add to first attempt artifacts
    // NOTE: The documentation states that attempt-level artifacts are attached to specific attempts.
    // However, stdout logs are generally associated with the test execution.
    // If the test has multiple attempts (retries), the XML might aggregate stdout or provide it per attempt.
    // Here we conservatively attach to the first attempt (index 0) if it exists,
    // OR ideally we should check if stdout contains attempt-specific info.
    // For now, attaching to attempt 0 is consistent with previous logic.
    if (!attemptArtifacts.has(0)) {
        attemptArtifacts.set(0, []);
    }
    // We must clone the artifacts because the convert command modifies the artifact.path in place
    // If we share the same object reference, the second time it's processed (e.g. as attempt artifact after test artifact),
    // the path will point to the destination folder instead of the source.
    attemptArtifacts.get(0)!.push(...stdoutArtifacts.map(a => ({ ...a })));
  }

  return { testArtifacts, attemptArtifacts };
}

export function extractArtifactsFromLog(log: string): Artifact[] {
  const artifacts: Artifact[] = [];
  
  // Format: [[CURRENTS.ATTACHMENT|path]] or [[CURRENTS.ATTACHMENT|path|level]]
  // Regex: \[\[CURRENTS\.ATTACHMENT\|([^|\]]+)(?:\|([^\]]+))?\]\]
  // Capture group 1: path (until next | or ])
  // Capture group 2: optional level (until ])
  
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
        type: 'attachment', // Default type, caller might refine based on extension
        contentType: 'application/octet-stream', // Default content type
        level: level
    });
  }

  // New JSON format: currents.artifact.{"path":...}
  const jsonMatches = log.matchAll(/currents\.artifact\.(\{.*?\})/g);
  for (const match of jsonMatches) {
    try {
        const artifact = JSON.parse(match[1]);
        if (artifact.path && artifact.type && artifact.contentType) {
            artifacts.push(artifact);
        }
    } catch (e) {}
  }

  return artifacts;
}

function parseArtifactsFromProperties(properties: Property[], level: 'spec' | 'test'): Artifact[] {
  const artifactMap = new Map<number, Partial<Artifact>>();
  const jsonArtifacts: Artifact[] = [];

  for (const prop of properties) {
    if (!prop.name || !prop.value) continue;

    if (prop.name === 'currents.artifact.JSON_ARTIFACT') {
      try {
        const artifact = JSON.parse(prop.value);
        if (artifact.path && artifact.type && artifact.contentType) {
          jsonArtifacts.push(artifact);
        }
      } catch (e) {}
      continue;
    }

    const regex = new RegExp(`^currents\\.artifact\\.${level}\\.(\\d+)\\.(.+)$`);
    const match = prop.name.match(regex);
    if (!match) continue;

    const [, indexStr, field] = match;
    const index = parseInt(indexStr, 10);

    if (!artifactMap.has(index)) {
      artifactMap.set(index, {});
    }

    const artifact = artifactMap.get(index)!;
    if (field === 'path' || field === 'type' || field === 'contentType' || field === 'name') {
      (artifact as any)[field] = prop.value;
    }
  }

  const indexedArtifacts = Array.from(artifactMap.values())
    .filter((a) => a.path && a.type && a.contentType && a.type !== 'stdout' && a.type !== 'stderr') as Artifact[];

  return [...indexedArtifacts, ...jsonArtifacts];
}

function parseAttemptArtifactsFromProperties(properties: Property[]): Map<number, Artifact[]> {
  const attemptArtifactsMap = new Map<number, Map<number, Partial<Artifact>>>();
  const jsonArtifactsMap = new Map<number, Artifact[]>();

  for (const prop of properties) {
    if (!prop.name || !prop.value) continue;

    if (prop.name === 'currents.artifact.JSON_ARTIFACT') {
       // JSON artifacts are currently only supported at test/spec level, not attempt level explicitly
       // unless we encode attempt info in the key or value.
       // However, the current helper implementation uses console.log which might end up in properties
       // if the test runner captures stdout as properties (JUnit usually doesn't capture stdout as properties).
       // JUnit properties are usually env vars or specific annotations.
       // If the input is JUnit XML, properties are <property name="..." value="..." />.
       // Our helpers use console.log, which goes to <system-out>.
       
       // Wait, if the user uses `attachArtifact` helper, it logs to console.
       // Does `convert` command parse <system-out>?
       // The `convert` command implementation I read in `index.ts` uses `extractAttachmentsFromLog` which parses `[[CURRENTS.ATTACHMENT|...]]`.
       // It does NOT seem to parse `currents.artifact` from logs, only from XML properties!
       
       // So for `convert` to work with the new helpers, the helpers must produce output that `convert` can understand
       // OR `convert` must be updated to parse `currents.artifact` from <system-out> as well.
       
       // The current `convert` implementation in `utils.ts` parses `currents.artifact` from *properties*.
       // Jest reporter captures console logs and puts them into the report.
       // But if we are using `convert` command, we are likely converting a JUnit XML report from another tool (like wdio, or just generic junit).
       
       // If the user uses `currents-jest` reporter, they don't use `convert`.
       // `convert` is for when you have a JUnit XML file and want to upload it to Currents.
       
       // So the user's question "how does the artifact helpers works for convert command?" implies:
       // "If I use these helpers in a test framework that outputs JUnit XML (not Jest reporter), will `convert` pick them up?"
       
       // If the test framework captures stdout and puts it in <system-out>, we need to parse <system-out> for these JSON logs.
       // Currently `convert` implementation in `index.ts` has `extractAttachmentsFromLog` but it only looks for `[[CURRENTS.ATTACHMENT|...]]`.
       
       // So I need to update `convert` to ALSO parse `currents.artifact...` from logs (system-out).
       continue;
    }

    const match = prop.name.match(/^currents\.artifact\.attempt\.(\d+)\.(\d+)\.(.+)$/);
    if (!match) continue;

    const [, attemptIndexStr, artifactIndexStr, field] = match;
    const attemptIndex = parseInt(attemptIndexStr, 10);
    const artifactIndex = parseInt(artifactIndexStr, 10);

    if (!attemptArtifactsMap.has(attemptIndex)) {
      attemptArtifactsMap.set(attemptIndex, new Map());
    }

    const artifactsMap = attemptArtifactsMap.get(attemptIndex)!;
    if (!artifactsMap.has(artifactIndex)) {
      artifactsMap.set(artifactIndex, {});
    }

    const artifact = artifactsMap.get(artifactIndex)!;
    if (field === 'path' || field === 'type' || field === 'contentType' || field === 'name') {
      (artifact as any)[field] = prop.value;
    }
  }

  const result = new Map<number, Artifact[]>();
  for (const [attemptIndex, artifactsMap] of attemptArtifactsMap.entries()) {
    const artifacts = Array.from(artifactsMap.values())
      .filter((a) => a.path && a.type && a.contentType && a.type !== 'stdout' && a.type !== 'stderr') as Artifact[];
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
        
        // For failed attempts, we assign stdout/stderr to the first attempt (index 0)
        // or potentially all of them depending on how we interpret "aggregated to the test".
        // Usually JUnit XML provides one system-out/err per testcase, not per failure/attempt.
        // So we can attach it to all, or just the first.
        // Let's attach to all attempts derived from this testcase, as they share the same XML node.
        
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

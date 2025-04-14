import { debug } from './debug';
import { convertToMs, createJUnitXML, createTestFileEntry } from './lib';
import { Summary, TestEvent, TestNode, TestState } from './types';

export default async function* customReporter(
  source: AsyncIterable<TestEvent>
): AsyncGenerator<string> {
  const reportState: TestState = {
    summary: null, // summary of the entire test run, from test:summary event
    fileSummaries: {}, // summary of each test file, from test:summary event
    testFiles: {}, // map of test files, keyed by file name
  };

  const nestedTestStack: Partial<TestNode>[] = [];

  for await (const event of source) {
    const { type: eventType, data } = event;

    // collect summary data
    if (eventType === 'test:summary') {
      const file = data?.file;
      if (file) {
        reportState.fileSummaries[file] = data as Summary;
      } else {
        reportState.summary = data as Summary;
      }

      debug('Summary event received', event.data);
      continue;
    }

    // skip events that don't have data or nesting level
    if (!data || typeof data.nesting !== 'number') continue;

    const { name, nesting: nestingLevel, file } = data;
    // skip events that don't have a file or name
    if (!file || !name) continue;

    const testName = name.replace(/"/g, '&quot;');

    // skip events other than test:start, test:pass, or test:fail
    if (!['test:start', 'test:pass', 'test:fail'].includes(eventType)) continue;

    // create a test file entry if it doesn't exist
    if (!reportState.testFiles[file]) {
      reportState.testFiles[file] = createTestFileEntry(file);
      debug('Test file entry created', file, reportState.testFiles[file]);
    }

    // ensure the nested test stack has enough levels
    while (nestedTestStack.length <= nestingLevel) {
      nestedTestStack.push({});
      debug(
        'Nested test stack expanded to accommodate nesting level',
        file,
        testName
      );
    }

    // get the parent node for the current nesting level
    // if nesting level is 0, use the test file entry as the parent
    // otherwise, use the previous level in the stack
    const parentNode =
      (nestedTestStack[nestingLevel - 1] as TestNode) ||
      reportState.testFiles[file];
    debug(
      'Parent node for nesting level %d - "%s"',
      nestingLevel,
      parentNode.name
    );

    if (eventType === 'test:start') {
      // create a new test node for the current test
      // if nesting level is 0, use the test name as is
      // otherwise, prepend the parent test name to the current test name
      // this creates a hierarchy of test names based on nesting level
      const fullName =
        nestingLevel === 0
          ? testName
          : `${nestedTestStack[nestingLevel - 1].name} > ${testName}`;
      debug('Creating test node for "%s"', fullName);
      const testNode: TestNode = {
        name: fullName,
        status: 'pending',
        children: [],
      };
      parentNode.children.push(testNode);
      nestedTestStack[nestingLevel] = testNode;
      continue;
    }

    // handle test pass and fail events
    // find the test node in the current nesting level
    const testNode = nestedTestStack[nestingLevel] as TestNode;
    if (!testNode || !testNode.name.endsWith(testName)) {
      console.warn(
        `Warning: Test node not found for event type "${eventType}" with name "${name}".`
      );
      continue;
    }

    testNode.time = data.details?.duration_ms
      ? convertToMs(data.details.duration_ms)
      : undefined;
    reportState.testFiles[file].stats.time += testNode.time || 0;

    // isSuite helps to recreate the skipped test case, one per suite
    testNode.isSuite = data.details?.type === 'suite';
    testNode.testNumber = data.testNumber; // only present when isSuite is true

    testNode.status = eventType === 'test:pass' ? 'passed' : 'failed';

    if (data.skip) {
      reportState.testFiles[file].stats.skipped += 1;
      testNode.status = 'skipped';
    }

    if (data.todo) {
      reportState.testFiles[file].stats.skipped += 1;
      testNode.status = 'todo';
    }

    if (eventType === 'test:fail') {
      reportState.testFiles[file].stats.failures += 1;
      const error = data.details?.error;
      testNode.failure = {
        name: error?.failureType || error?.code,
        message: error?.message,
        stack: error,
      };
    }
  }

  debug('Final state:', reportState);
  yield createJUnitXML(reportState);
}

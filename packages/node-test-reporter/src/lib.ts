import { hostname } from 'os';
import { create } from 'xmlbuilder2';
import { debug as _debug } from './debug';

const debug = _debug.extend('lib');

import { Summary, TestFile, TestNode, TestState } from './types';

type XMLBuilder = ReturnType<typeof create>;

const HOSTNAME = hostname();

export function createTestFileEntry(file: string): TestFile {
  return {
    name: file,
    timestamp: new Date().toISOString(),
    children: [],
    hostname: HOSTNAME,
    stats: {
      failures: 0,
      skipped: 0,
      time: 0,
    },
  };
}

export function createJUnitXML(state: TestState): string {
  debug('Creating JUnit XML');
  const builder = create({ version: '1.0', encoding: 'UTF-8' }).ele(
    'testsuites',
    {
      name: 'root',
      ...(state.summary ? getSummaryAttrs(state.summary) : {}),
    }
  );

  Object.values(state.testFiles).forEach((file) => {
    debug('Creating test suite element for file', file.name);
    createTestSuiteElement({
      file,
      summary: state.fileSummaries[file.name],
      parentElement: builder,
    });
  });

  debug('Ending XML document');
  return builder.end({ prettyPrint: true });
}

export function convertToMs(time: number): number {
  return Number((time / 1000).toFixed(6));
}

function flattenTests(tests: TestNode[], parentElement: XMLBuilder) {
  for (const test of tests) {
    debug('Flattening test', test.name, test.status);
    const isSkippedOrTodo = test.status === 'skipped' || test.status === 'todo';

    const shouldRenderAsSuite = test.isSuite && isSkippedOrTodo;
    const shouldRenderAsCase = !test.isSuite;

    // create one testcase per skipped suite
    if (shouldRenderAsSuite) {
      const testcase = parentElement.ele('testcase', {
        name: test.name,
        time: test.time,
        testNumber: test.testNumber,
      });

      testcase.ele('skipped', getSkippedAttrs(test));
    } else if (shouldRenderAsCase) {
      const testcase = parentElement.ele('testcase', {
        name: test.name,
        time: test.time,
      });

      if (test.status === 'failed') {
        const formattedMessage = `${test.failure?.message}\n${formatError(test.failure?.stack)}`;
        const failureElement = testcase.ele('failure', {
          type: test.failure?.name,
          message: formattedMessage,
        });

        if (typeof test.failure?.stack === 'object') {
          failureElement.dat(formatError(test.failure.stack));
        } else {
          failureElement.txt(test.failure?.stack as string);
        }
      } else if (isSkippedOrTodo) {
        testcase.ele('skipped', getSkippedAttrs(test));
      }
    }

    if (test.children?.length) {
      flattenTests(test.children, parentElement);
    }
  }
}

function getSkippedAttrs(test: TestNode) {
  return {
    type: test.status === 'todo' ? 'todo' : undefined,
  };
}

function createTestSuiteElement({
  file,
  summary,
  parentElement,
}: {
  file: TestFile;
  summary?: Summary;
  parentElement: XMLBuilder;
}) {
  const summaryAtts = summary ? getSummaryAttrs(summary) : {};
  const time = 'time' in summaryAtts ? summaryAtts.time : file.stats.time;
  const testsuite = parentElement.ele('testsuite', {
    name: getSuiteName(file.name),
    timestamp: file.timestamp,
    hostname: file.hostname,
    ...summaryAtts,
    ...file.stats,
    time,
  });
  flattenTests(file.children, testsuite);
}

function getSummaryAttrs(summary: Summary) {
  return {
    success: summary.success,
    time: convertToMs(summary.duration_ms || 0),
  };
}

function formatError(error: unknown): string {
  if (!error) return '';
  return `${JSON.stringify(error, null, 2)}\n`;
}

function getSuiteName(file: string): string {
  return file
    .replace(process.cwd(), '')
    .replace(/"/g, '&quot;')
    .replace(/^\//, '');
}

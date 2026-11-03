import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJUnitXML } from '../lib';
import customReporter from '../reporter';
import { TestEvent, TestState } from '../types';

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  hostname: () => 'test-host',
}));

const fixtures = join(__dirname, 'fixtures');

beforeEach(() => {
  vi.useFakeTimers({
    now: new Date('2025-01-02T03:04:05.678Z'),
    toFake: ['Date'],
  });
});

describe('JUnit XML for recorded node:test runs', () => {
  it.each(['basic', 'failures', 'chars', 'empty', 'no-files'])(
    '%s',
    async (name) => {
      expectFixture(name, await report(readEvents(name)));
    }
  );

  it('throws when an error value contains the CDATA end ]]>', async () => {
    await expect(report(readEvents('cdata'))).rejects.toThrow(
      'The string contains invalid characters.'
    );
  });
});

describe('createJUnitXML', () => {
  it('writes values that node:test does not send', () => {
    const state: TestState = {
      summary: null,
      fileSummaries: {},
      testFiles: {
        [`${process.cwd()}/dir/"quoted" & <file>.test.mjs`]: {
          name: `${process.cwd()}/dir/"quoted" & <file>.test.mjs`,
          timestamp: '2025-01-02T03:04:05.678Z',
          hostname: 'test-host',
          stats: { failures: 3, skipped: 1, time: 0.5 },
          children: [
            {
              name: 'string stack',
              status: 'failed',
              time: 0.1,
              children: [],
              failure: {
                name: 'Custom & <type>',
                message: 'text & <markup> ]]> "quotes"',
                stack: 'text & <markup> ]]> "quotes"\n  at line two',
              },
            },
            {
              name: 'null stack',
              status: 'failed',
              children: [],
              failure: { message: 'null', stack: null },
            },
            {
              name: 'no failure details',
              status: 'failed',
              children: [],
            },
            {
              name: 'passed suite',
              status: 'passed',
              isSuite: true,
              children: [
                {
                  name: 'passed suite > child',
                  status: 'passed',
                  children: [],
                },
              ],
            },
            {
              name: 'skipped suite',
              status: 'skipped',
              isSuite: true,
              testNumber: 4,
              children: [
                {
                  name: 'skipped suite > child',
                  status: 'skipped',
                  children: [],
                },
              ],
            },
            { name: 'pending', status: 'pending', children: [] },
          ],
        },
      },
    };
    expectFixture('synthetic', createJUnitXML(state));
  });
});

// Run with UPDATE_JUNIT_FIXTURES=1 to rewrite the expected files.
function expectFixture(name: string, xml: string) {
  const file = join(fixtures, 'junit', `${name}.xml`);
  if (process.env.UPDATE_JUNIT_FIXTURES) {
    writeFileSync(file, xml);
  }
  // Writing to a file encodes lone surrogates as U+FFFD, as the reporter
  // destination stream does.
  expect(Buffer.from(xml).toString()).toBe(readFileSync(file, 'utf8'));
}

async function report(events: TestEvent[]) {
  let xml = '';
  for await (const chunk of customReporter(toAsyncIterable(events))) {
    xml += chunk;
  }
  return xml;
}

async function* toAsyncIterable<T>(items: T[]) {
  yield* items;
}

// Reads events written by fixtures/record-events.mjs.
function readEvents(name: string): TestEvent[] {
  const json = readFileSync(join(fixtures, 'events', `${name}.json`), 'utf8');
  const events: TestEvent[] = JSON.parse(json, restoreError);
  return events.map((event) =>
    event.data?.file
      ? {
          ...event,
          data: { ...event.data, file: join(process.cwd(), event.data.file) },
        }
      : event
  );
}

function restoreError(_key: string, value: any) {
  if (!value?.errorJSON) {
    return value;
  }
  return Object.defineProperty(value.errorJSON, 'message', {
    value: value.errorMessage,
  });
}

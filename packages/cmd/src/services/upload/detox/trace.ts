import { debug as _debug } from '@debug';
import fs from 'fs-extra';
import { join } from 'path';
import { Step } from '../../../types';

const debug = _debug.extend('detox');

export const DETOX_TRACE_FILE = 'detox.trace.json';

/** Element actions and expectations, the spans worth showing as steps. */
const STEP_CATEGORY = 'ws-client-invocation';

type TraceEvent = {
  ph: string;
  name?: string;
  pid?: number;
  tid?: number;
  cat?: string;
  ts?: number;
  args?: Record<string, unknown>;
};

export type TraceTestSlice = {
  fullName: string;
  invocations: number;
  steps: Step[];
};

type OpenSpan = {
  name: string;
  cat: string;
  ts: number;
};

/**
 * Detox writes a Trace Event file per session when logs are recorded. The test
 * lifecycle and the element actions are logged under different categories, and
 * the trace assigns each category its own thread id, so actions are matched to
 * a test by the time window of the test rather than by nesting.
 */
export async function readDetoxTrace(
  artifactsRootDir: string
): Promise<Map<string, TraceTestSlice[]>> {
  const filePath = join(artifactsRootDir, DETOX_TRACE_FILE);
  const byFullName = new Map<string, TraceTestSlice[]>();

  let events: TraceEvent[];
  try {
    events = await fs.readJson(filePath);
  } catch {
    debug('No Detox trace at %s', filePath);
    return byFullName;
  }

  if (!Array.isArray(events)) {
    debug('Unexpected Detox trace contents at %s', filePath);
    return byFullName;
  }

  const tests = getTestSlices(events);
  const steps = getStepSpans(events);

  steps.forEach(({ pid, ts, step }) => {
    // The latest test that was running: a window containing another one belongs
    // to an earlier attempt of the same test.
    const test = tests
      .filter(
        (candidate) =>
          candidate.pid === pid &&
          ts >= candidate.startTs &&
          ts <= candidate.endTs
      )
      .sort((a, b) => a.startTs - b.startTs)
      .pop();

    test?.steps.push(step);
  });

  tests.forEach(({ fullName, invocations, steps: testSteps }) => {
    const slices = byFullName.get(fullName) ?? [];
    slices.push({
      fullName,
      invocations,
      steps: testSteps.sort(
        (a, b) => +new Date(a.startTime) - +new Date(b.startTime)
      ),
    });
    byFullName.set(fullName, slices);
  });

  return byFullName;
}

type TestWindow = TraceTestSlice & {
  pid: number;
  startTs: number;
  endTs: number;
};

function getTestSlices(events: TraceEvent[]): TestWindow[] {
  const open = new Map<string, TestWindow>();
  const tests: TestWindow[] = [];

  events.forEach((event) => {
    const key = `${event.pid}:${event.tid}`;

    if (event.ph === 'B' && event.args?.context === 'test') {
      const fullName = event.args?.fullName;
      if (typeof fullName !== 'string') {
        return;
      }

      open.set(key, {
        fullName,
        invocations: Number(event.args?.invocations ?? 1),
        pid: Number(event.pid),
        startTs: Number(event.ts),
        endTs: Number.MAX_SAFE_INTEGER,
        steps: [],
      });
      return;
    }

    if (event.ph === 'E' && open.has(key)) {
      const test = open.get(key)!;
      open.delete(key);
      tests.push({ ...test, endTs: Number(event.ts) });
    }
  });

  // A crashed run leaves the last test unclosed; its steps are still wanted.
  return [...tests, ...open.values()];
}

function getStepSpans(events: TraceEvent[]) {
  const stacks = new Map<string, OpenSpan[]>();
  const spans: { pid: number; ts: number; step: Step }[] = [];

  events.forEach((event) => {
    if (!event.cat?.includes(STEP_CATEGORY)) {
      return;
    }

    const key = `${event.pid}:${event.tid}`;
    const stack = stacks.get(key) ?? [];

    if (event.ph === 'B') {
      stack.push({
        name: event.name ?? 'action',
        cat: event.cat,
        ts: Number(event.ts),
      });
      stacks.set(key, stack);
      return;
    }

    if (event.ph === 'E') {
      const span = stack.pop();
      if (!span) {
        return;
      }

      spans.push({
        pid: Number(event.pid),
        ts: span.ts,
        step: {
          title: span.name,
          category: 'detox',
          startTime: new Date(span.ts / 1e3).toISOString(),
          duration: Math.round((Number(event.ts) - span.ts) / 1e3),
          steps: [],
        },
      });
    }
  });

  return spans;
}

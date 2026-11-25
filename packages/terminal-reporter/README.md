# @currents/terminal-reporter

Beta. Live terminal view of a test run. The `@currents/playwright` reporter
(local mode) and `currents watch` in `@currents/cmd` (remote mode) turn their
own sources into a stream of `TerminalRunEvent`s and pass it here; this package
knows nothing about Playwright or GraphQL.

```ts
import { createTerminalReporter } from '@currents/terminal-reporter';

const view = createTerminalReporter();
view.push({ type: 'runBegin', totalTests: 2, startedAt: Date.now() });
view.push({
  type: 'testBegin',
  testId: 't1',
  title: ['logs in'],
  file: 'login.spec.ts',
  worker: '0',
  retry: 0,
});
view.push({
  type: 'testEnd',
  testId: 't1',
  status: 'passed',
  durationMs: 900,
  retry: 0,
});
view.push({ type: 'runEnd', status: 'passed' });
```

- `reduce(state, event)` is the pure state update, `renderFrame(state, opts)`
  turns state into lines. Both are exported for tests and other front ends.
- On a stream that is not a TTY only the final summary is written. Callers
  should keep their usual output when `CI` is set or stdout is not a TTY.

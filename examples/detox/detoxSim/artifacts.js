const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TRACE_FILE = 'detox.trace.json';

/**
 * Detox names the artifact directory of a test after its full name, with the
 * status sign in front and ` (n)` for the n-th invocation within the session -
 * where n continues across the reruns of `detox test --retries`.
 */
const getTestDirName = ({ fullName, status, invocation }) => {
  const sign = status === 'passed' ? '✓ ' : status === 'failed' ? '✗ ' : '';
  const suffix = invocation > 1 ? ` (${invocation})` : '';

  return `${sign}${fullName}${suffix}`;
};

const getDeviceLog = ({ fullName, status }) =>
  [
    `01-14 09:41:02.118  1284  1284 I Detox   : Test started: ${fullName}`,
    '01-14 09:41:02.301  1284  1311 D Detox   : action=tap target=by.id("amount-input")',
    '01-14 09:41:02.884  1284  1311 D Detox   : action=typeText text="0.0421" target=by.id("amount-input")',
    '01-14 09:41:03.442  1284  1311 D Detox   : action=tap target=by.id("send-button")',
    '01-14 09:41:03.902  1284  1290 I Wallet  : POST /v1/transactions -> 202',
    status === 'failed'
      ? '01-14 09:41:08.907  1284  1311 E Detox   : expectation failed: by.id("confirm-dialog") is not visible after 5000ms'
      : '01-14 09:41:04.512  1284  1311 D Detox   : expectation passed: by.id("confirm-dialog") is visible',
    `01-14 09:41:09.044  1284  1284 I Detox   : Test finished: ${fullName} (${status})`,
    '',
  ].join('\n');

const writeTestArtifacts = ({ rootDir, fullName, status, invocation }) => {
  const dir = path.join(
    rootDir,
    getTestDirName({ fullName, status, invocation })
  );
  fs.mkdirSync(dir, { recursive: true });

  fs.copyFileSync(
    path.join(FIXTURES_DIR, 'recording.mp4'),
    path.join(dir, 'test.mp4')
  );
  fs.writeFileSync(
    path.join(dir, 'device.log'),
    getDeviceLog({ fullName, status })
  );

  if (status === 'failed') {
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'screen.png'),
      path.join(dir, 'test-after-failure.png')
    );
  }
};

const ACTIONS = [
  { name: 'launch the app', duration: 4200 },
  { name: 'tap on view with id "amount-input"', duration: 260 },
  { name: 'type "0.0421" in view with id "amount-input"', duration: 640 },
  { name: 'tap on view with id "send-button"', duration: 310 },
];

const EXPECTATION = 'expect view with id "confirm-dialog" to be visible';

/**
 * The trace Detox writes when logs are recorded: the test lifecycle and the
 * element actions land on separate threads, which is why the reporter matches
 * actions to a test by time rather than by nesting.
 */
const getTraceEvents = ({ fullName, title, status, invocation, startedAt }) => {
  const pid = 1284;
  let ts = startedAt * 1000;

  const events = [
    {
      ph: 'B',
      name: title,
      pid,
      tid: 0,
      cat: 'lifecycle',
      ts,
      args: {
        context: 'test',
        status: 'running',
        fullName,
        invocations: invocation,
      },
    },
  ];

  const actions = [
    ...ACTIONS,
    { name: EXPECTATION, duration: status === 'failed' ? 5000 : 480 },
  ];

  actions.forEach((action) => {
    ts += 40 * 1000;
    events.push({
      ph: 'B',
      name: action.name,
      pid,
      tid: 1,
      cat: 'ws-client,ws-client-invocation',
      ts,
      args: {},
    });
    ts += action.duration * 1000;
    events.push({
      ph: 'E',
      pid,
      tid: 1,
      cat: 'ws-client,ws-client-invocation',
      ts,
    });
  });

  events.push({ ph: 'E', pid, tid: 0, cat: 'lifecycle', ts: ts + 20 * 1000 });

  return events;
};

/** Detox appends to one trace per session, so the reruns extend the same file. */
const appendTrace = (rootDir, events) => {
  const filePath = path.join(rootDir, TRACE_FILE);
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : [];

  fs.writeFileSync(filePath, JSON.stringify([...existing, ...events], null, 1));
};

module.exports = { appendTrace, getTraceEvents, writeTestArtifacts };

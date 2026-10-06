// Runs from the project folder, which has Jest, @currents/jest and
// @currents/cmd installed. For each run, runs Jest with @currents/jest, then
// `currents run upload` against a local server in place of the Currents API.
// @currents/jest writes fullTestSuite.json only for Detox runs, so each upload
// lists the suite with a discovery run of the project's Jest.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const STRINGS_TESTS = ['strings joins', 'strings splits'];
const ALL_TESTS = [
  'math adds',
  'math nested multiplies @smoke',
  ...STRINGS_TESTS,
];

// `tests` is the suite upload sends: discovery drops --shard, so a shard
// uploads the whole suite, and keeps test path patterns, so a filtered run
// uploads the tests that match.
const RUNS = [
  { name: 'full', jestArgs: [], tests: ALL_TESTS, specCount: 2 },
  {
    name: 'sharded',
    jestArgs: ['--shard=1/2'],
    tests: ALL_TESTS,
    specCount: 1,
  },
  {
    name: 'path-argument',
    jestArgs: ['strings'],
    tests: STRINGS_TESTS,
    specCount: 1,
  },
  {
    name: 'path-option',
    jestArgs: [getTestPathPatternOption(), 'strings'],
    tests: STRINGS_TESTS,
    specCount: 1,
  },
];

const runRequests = [];
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (req.method !== 'POST') {
    res.writeHead(200).end();
    return;
  }
  const request = JSON.parse(zlib.gunzipSync(Buffer.concat(chunks)));
  runRequests.push(request);
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      runId: 'run',
      groupId: request.group,
      runUrl: 'http://localhost/run',
      artifactUploadUrls: [],
    })
  );
});
await new Promise((resolve) => server.listen(0, resolve));
const apiUrl = `http://localhost:${server.address().port}`;

const failures = [];
try {
  for (const run of RUNS) {
    console.log(`\n=== ${run.name} run`);
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
    runRequests.length = 0;

    await exec('npx', ['jest', ...run.jestArgs], {
      CURRENTS_REPORT_DIR: reportDir,
    });
    await exec(
      'npx',
      [
        'currents',
        'run',
        'upload',
        '--report-dir',
        reportDir,
        '--project-id',
        'jest-versions',
        '--key',
        'record-key',
        '--ci-build-id',
        `jest-versions-${run.name}`,
      ],
      { CURRENTS_API_URL: apiUrl }
    );

    const discoveredTests = getTestTitles(
      JSON.parse(
        fs.readFileSync(path.join(reportDir, 'fullTestSuite.json'), 'utf8')
      )
    );
    expectEqual(run, 'tests in fullTestSuite.json', discoveredTests, run.tests);
    // The first request creates the run with the suite, the next ones send
    // the results of the spec files.
    expectEqual(
      run,
      'tests in the uploaded suite',
      getTestTitles(runRequests.flatMap((request) => request.fullTestSuite)),
      run.tests
    );
    expectEqual(
      run,
      'uploaded spec files',
      runRequests.flatMap((request) => request.instances).length,
      run.specCount
    );
  }
} finally {
  server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nEvery run uploaded the expected suite and spec files.');

function exec(command, args, env) {
  return new Promise((resolve, reject) => {
    spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })
      .on('error', reject)
      .on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(`${command} ${args.join(' ')} exited with ${code}`)
            )
      );
  });
}

// Jest 30 renamed --testPathPattern to --testPathPatterns.
function getTestPathPatternOption() {
  const { version } = createRequire(path.resolve('package.json'))(
    'jest/package.json'
  );
  return Number(version.split('.')[0]) >= 30
    ? '--testPathPatterns'
    : '--testPathPattern';
}

function getTestTitles(fullTestSuite) {
  return fullTestSuite
    .flatMap((project) => project.tests.map((test) => test.title.join(' ')))
    .sort();
}

function expectEqual(run, label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${run.name} run, ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

const fs = require('fs');
const path = require('path');
const {
  appendTrace,
  getTraceEvents,
  writeTestArtifacts,
} = require('./artifacts');
const { getReportDir, readSession, writeSession } = require('./session');

/**
 * Stands in for the Detox artifact plugins and the log finalizer, which write
 * per test once the runner is done. The manifest of @currents/jest says which
 * attempts this Jest process ran, and Detox numbers them
 * `testSessionIndex * (1 + jest retryTimes) + invocations`.
 */
module.exports = async () => {
  const session = readSession();
  const { detoxConfig, testSessionIndex } = session;
  const rootDir = path.resolve(__dirname, '..', detoxConfig.artifacts.rootDir);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(getReportDir(), 'detox.json'), 'utf8')
  );

  // Each simulated test gets its own window in the trace, the way real
  // timestamps from a device would.
  let startedAt = session.traceCursor ?? Date.now();

  manifest.tests.forEach((test) =>
    test.attempts
      .filter((attempt) => attempt.session === testSessionIndex)
      .forEach((attempt) => {
        const invocation = testSessionIndex + attempt.invocations;

        writeTestArtifacts({
          rootDir,
          fullName: test.fullName,
          status: attempt.status,
          invocation,
        });

        appendTrace(
          rootDir,
          getTraceEvents({
            fullName: test.fullName,
            title: test.fullName.split(' ').slice(1).join(' '),
            status: attempt.status,
            invocation,
            startedAt,
          })
        );

        startedAt += 30_000;
      })
  );

  writeSession({ ...session, traceCursor: startedAt });

  console.log(
    `[detoxSim] session ${testSessionIndex} artifacts written to ${detoxConfig.artifacts.rootDir}`
  );
};

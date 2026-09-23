import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import { basename, join } from 'path';

const projectDir = join(__dirname, 'fixtures', 'report-project');

// The built reporter, since Jest loads reporters without transpiling them.
// Pointing this at another build compares the two, e.g. the one on main.
const reporterPath =
  process.env.CURRENTS_TEST_REPORTER ?? join(__dirname, '../../dist/index.js');

const TIMING_KEYS =
  /^(_t|startTime|endTime|duration|wallClock\w*|start|end|runtime)$/;

jest.setTimeout(60_000);

describe('reporter', () => {
  let reportDir: string;
  let artifactsRootDir: string;

  beforeAll(() => {
    if (!fs.existsSync(reporterPath)) {
      throw new Error(`Build the reporter first: ${reporterPath} is missing`);
    }
  });

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(join(os.tmpdir(), 'currents-jest-report-'));
    artifactsRootDir = await fs.mkdtemp(
      join(os.tmpdir(), 'currents-jest-artifacts-')
    );
  });

  afterEach(async () => {
    await fs.remove(reportDir);
    await fs.remove(artifactsRootDir);
  });

  it('reports a Jest run', async () => {
    runJest();

    expect(await fs.readdir(reportDir)).toEqual(['config.json', 'instances']);
    expect(await readReport()).toMatchSnapshot();
  });

  it('replaces the report of an earlier run', async () => {
    runJest();
    const first = await readReport();

    runJest();

    expect(await readReport()).toEqual(first);
  });

  it('marks a Detox run and writes the files upload reads', async () => {
    runJest();
    const jestReport = await readReport();
    await fs.remove(reportDir);

    runJest({ DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(0) });
    const report = await readReport();

    expect((await fs.readdir(reportDir)).sort()).toEqual([
      'config.json',
      'detox.json',
      'fullTestSuite.json',
      'instances',
    ]);
    expect(report.originFramework).toBe('detox');
    expect(report.instances).toEqual(jestReport.instances);

    const manifest = await fs.readJson(join(reportDir, 'detox.json'));
    expect(manifest).toMatchObject({
      artifactsRootDir,
      configuration: 'ios.sim.debug',
      testSessionIndex: 0,
    });
    expect(
      manifest.tests.find(
        (test: { fullName: string }) =>
          test.fullName === 'retries passes on the second attempt'
      )?.attempts
    ).toEqual([
      { attempt: 0, session: 0, invocations: 1, status: 'failed' },
      { attempt: 1, session: 0, invocations: 2, status: 'passed' },
    ]);

    const fullTestSuite = await fs.readJson(
      join(reportDir, 'fullTestSuite.json')
    );
    expect(
      fullTestSuite.map((project: { name: string; tests: unknown[] }) => [
        project.name,
        project.tests.length,
      ])
    ).toEqual([
      ['checks', 8],
      ['probes', 1],
    ]);
  });

  it('adds the attempts of a Detox rerun to the earlier report', async () => {
    runJest({ DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(0) });
    const first = await readReport();

    runJest({ DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(1) });
    const merged = await readReport();

    const attemptCount = (report: Report, title: string) =>
      Object.values(report.instances)
        .flatMap((instance) => instance.results.tests)
        .find((test) => test.title.join(' ') === title)?.attempts.length;

    expect(attemptCount(first, 'retries passes on the second attempt')).toBe(2);
    expect(attemptCount(merged, 'retries passes on the second attempt')).toBe(
      4
    );
    expect(attemptCount(merged, 'basic passes')).toBe(2);
  });

  it('writes a Detox run and its reruns to the directory of the session', async () => {
    const sessionReportDir = join(
      projectDir,
      '.currents',
      basename(artifactsRootDir)
    );

    try {
      runJest({
        CURRENTS_TEST_REPORT_DIR: '',
        DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(0),
      });
      runJest({
        CURRENTS_TEST_REPORT_DIR: '',
        DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(1),
      });

      const manifest = await fs.readJson(join(sessionReportDir, 'detox.json'));
      expect(
        manifest.tests.find(
          (test: { fullName: string }) => test.fullName === 'basic passes'
        )?.attempts
      ).toEqual([
        { attempt: 0, session: 0, invocations: 1, status: 'passed' },
        { attempt: 0, session: 1, invocations: 1, status: 'passed' },
      ]);
    } finally {
      await fs.remove(join(projectDir, '.currents'));
    }
  });

  it('leaves out the reruns of an earlier session', async () => {
    runJest({ DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(0) });
    runJest({ DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(1) });
    runJest({ DETOX_CONFIG_SNAPSHOT_PATH: await writeDetoxSession(0) });

    const manifest = await fs.readJson(join(reportDir, 'detox.json'));
    expect(
      manifest.tests.find(
        (test: { fullName: string }) => test.fullName === 'basic passes'
      )?.attempts
    ).toEqual([{ attempt: 0, session: 0, invocations: 1, status: 'passed' }]);
  });

  function runJest(env: NodeJS.ProcessEnv = {}) {
    const inheritedEnv = { ...process.env };
    // Set by the Jest process running this test, and read by the one it starts.
    delete inheritedEnv.JEST_WORKER_ID;
    delete inheritedEnv.DETOX_CONFIG_SNAPSHOT_PATH;
    delete inheritedEnv.CURRENTS_REPORT_DIR;

    try {
      execFileSync(
        process.execPath,
        [
          require.resolve('jest/bin/jest'),
          '--config',
          'jest.config.js',
          '--ci',
        ],
        {
          cwd: projectDir,
          stdio: 'pipe',
          env: {
            ...inheritedEnv,
            CURRENTS_TEST_REPORTER: reporterPath,
            CURRENTS_TEST_REPORT_DIR: reportDir,
            ...env,
          },
        }
      );
    } catch (error) {
      // The fixture has failing tests, so Jest exits with 1.
      if ((error as { status?: number }).status !== 1) {
        throw error;
      }
    }
  }

  async function writeDetoxSession(testSessionIndex: number) {
    const sessionFilePath = join(artifactsRootDir, 'session.json');
    await fs.writeJson(sessionFilePath, {
      detoxConfig: {
        configurationName: 'ios.sim.debug',
        artifacts: { rootDir: artifactsRootDir },
      },
      testSessionIndex,
    });
    return sessionFilePath;
  }

  async function readReport(): Promise<Report> {
    const config = await fs.readJson(join(reportDir, 'config.json'));
    const instancesDir = join(reportDir, 'instances');
    const instances: Report['instances'] = {};

    for (const fileName of (await fs.readdir(instancesDir)).sort()) {
      const instance = await fs.readJson(join(instancesDir, fileName));
      // The order of the tests differs between machines.
      instance.results.tests.sort(
        (a: { title: string[] }, b: { title: string[] }) =>
          a.title.join(' ').localeCompare(b.title.join(' '))
      );
      instances[instance.spec] = normalize(instance);
    }

    return {
      framework: config.framework,
      cliArgs: config.cliArgs,
      originFramework: config.frameworkConfig.originFramework,
      instances,
    };
  }
});

type Report = {
  framework: string;
  cliArgs: unknown;
  originFramework?: string;
  instances: Record<
    string,
    { results: { tests: { title: string[]; attempts: unknown[] }[] } }
  >;
};

/**
 * Blanks what changes between runs: timings, and the stack frames of error
 * messages, which point into node_modules and the reporter build.
 */
function normalize(value: any, key?: string): any {
  if (key && TIMING_KEYS.test(key)) {
    return '<timing>';
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, normalize(value[k], k)])
    );
  }
  if (typeof value === 'string') {
    return value.split('\n    at ')[0].split(projectDir).join('<project>');
  }
  return value;
}

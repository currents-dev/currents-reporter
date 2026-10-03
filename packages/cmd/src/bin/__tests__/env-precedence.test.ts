import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAPIGetRunCommandConfig } from '../../config/api';
import { getCacheCommandConfig } from '../../config/cache';
import { getCancelCommandConfig } from '../../config/cancel';
import { getConvertCommandConfig } from '../../config/convert';
import { getCurrentsConfig } from '../../config/upload';
import {
  handleRunAttach,
  handleSessionAttach,
  handleSessionShare,
  handleSessionStart,
} from '../../services/session';
import { getProgram } from '../program';

vi.mock('../../services', () => ({
  handleCurrentsReport: vi.fn(),
  handleGetCache: vi.fn(),
  handleSetCache: vi.fn(),
  handleCancelRun: vi.fn(),
  handleGetRun: vi.fn(),
}));
vi.mock('../../services/convert', () => ({ handleConvert: vi.fn() }));
vi.mock('../../services/session', () => ({
  handleRunAttach: vi.fn(),
  handleSessionAttach: vi.fn(),
  handleSessionShare: vi.fn(),
  handleSessionStart: vi.fn(),
}));

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

const env = {
  CURRENTS_API_KEY: 'api-key-env',
  CURRENTS_CI_BUILD_ID: 'build-env',
  CURRENTS_MACHINE_ID: 'machine-env',
  CURRENTS_OUTPUT: 'output-env.json',
  CURRENTS_PROJECT_ID: 'project-env',
  CURRENTS_RECORD_KEY: 'key-env',
  CURRENTS_REPORT_DIR: 'report-env',
  CURRENTS_RUN_ID: 'run-env',
  CURRENTS_SESSION_ID: 'session-env',
  CURRENTS_TAG: 'tagA, tagB',
};

async function parse(args: string[], values: Record<string, string> = {}) {
  [...Object.keys(env), 'CURRENTS_DEBUG'].forEach((name) =>
    vi.stubEnv(name, undefined)
  );
  vi.stubEnv('CURRENTS_REMOVE_TITLE_TAGS', undefined);
  vi.stubEnv('CURRENTS_DISABLE_TITLE_TAGS', undefined);
  Object.entries(values).forEach(([name, value]) => vi.stubEnv(name, value));
  try {
    await getProgram().parseAsync(args, { from: 'user' });
  } catch (e) {
    if (!(e instanceof ExitError)) throw e;
  }
}

const lastConfig = (fn: unknown) =>
  vi.mocked(fn as (...args: unknown[]) => unknown).mock.lastCall?.[0];

describe('command-line options and environment variables', () => {
  let reportFile: string;

  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(console, 'log').mockReturnValue();
    vi.spyOn(console, 'error').mockReturnValue();
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
    reportFile = join(
      fs.mkdtempSync(join(os.tmpdir(), 'precedence-')),
      'r.xml'
    );
    fs.writeFileSync(reportFile, '<testsuites/>');
  });

  afterEach(() => {
    fs.removeSync(reportFile);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const commands: {
    name: string;
    args: string[];
    flags: string[];
    getConfig: () => unknown;
    fromEnv: Record<string, unknown>;
    fromFlags: Record<string, unknown>;
  }[] = [
    {
      name: 'run upload',
      args: ['run', 'upload'],
      flags: [
        '--key=key-flag',
        '--project-id=project-flag',
        '--ci-build-id=build-flag',
        '--machine-id=machine-flag',
        '--report-dir=report-flag',
        '--tag=flagTag',
      ],
      getConfig: () => getCurrentsConfig(),
      fromEnv: {
        recordKey: 'key-env',
        projectId: 'project-env',
        ciBuildId: 'build-env',
        machineId: 'machine-env',
        reportDir: 'report-env',
        tag: ['tagA', 'tagB'],
      },
      fromFlags: {
        recordKey: 'key-flag',
        projectId: 'project-flag',
        ciBuildId: 'build-flag',
        machineId: 'machine-flag',
        reportDir: 'report-flag',
        tag: ['flagTag'],
      },
    },
    {
      name: 'run cancel',
      args: ['run', 'cancel'],
      flags: [
        '--key=key-flag',
        '--project-id=project-flag',
        '--ci-build-id=build-flag',
        '--run-id=run-flag',
      ],
      getConfig: () => getCancelCommandConfig(),
      fromEnv: {
        recordKey: 'key-env',
        projectId: 'project-env',
        ciBuildId: 'build-env',
        runId: 'run-env',
      },
      fromFlags: {
        recordKey: 'key-flag',
        projectId: 'project-flag',
        ciBuildId: 'build-flag',
        runId: 'run-flag',
      },
    },
    {
      name: 'run get',
      args: ['run', 'get'],
      flags: [
        '--api-key=api-key-flag',
        '--project-id=project-flag',
        '--output=output-flag.json',
        '--ci-build-id=build-flag',
      ],
      getConfig: () => getAPIGetRunCommandConfig(),
      fromEnv: {
        apiKey: 'api-key-env',
        projectId: 'project-env',
        output: 'output-env.json',
        ciBuildId: 'build-env',
      },
      fromFlags: {
        apiKey: 'api-key-flag',
        projectId: 'project-flag',
        output: 'output-flag.json',
        ciBuildId: 'build-flag',
      },
    },
    ...['set', 'get'].map((subcommand) => ({
      name: `cache ${subcommand}`,
      args: ['cache', subcommand],
      flags: ['--key=key-flag'],
      getConfig: () => getCacheCommandConfig().values,
      fromEnv: { recordKey: 'key-env' },
      fromFlags: { recordKey: 'key-flag' },
    })),
    {
      name: 'run attach',
      args: ['run', 'attach', 'a.png'],
      flags: [
        '--key=key-flag',
        '--api-key=api-key-flag',
        '--project-id=project-flag',
        '--ci-build-id=build-flag',
        '--machine-id=machine-flag',
      ],
      getConfig: () => lastConfig(handleRunAttach),
      fromEnv: {
        recordKey: 'key-env',
        apiKey: 'api-key-env',
        projectId: 'project-env',
        ciBuildId: 'build-env',
        machineId: 'machine-env',
      },
      fromFlags: {
        recordKey: 'key-flag',
        apiKey: 'api-key-flag',
        projectId: 'project-flag',
        ciBuildId: 'build-flag',
        machineId: 'machine-flag',
      },
    },
    {
      name: 'session start',
      args: ['session', 'start', '--title=t'],
      flags: ['--api-key=api-key-flag', '--project-id=project-flag'],
      getConfig: () => lastConfig(handleSessionStart),
      fromEnv: { apiKey: 'api-key-env', projectId: 'project-env' },
      fromFlags: { apiKey: 'api-key-flag', projectId: 'project-flag' },
    },
    {
      name: 'session attach',
      args: ['session', 'attach', 'a.png'],
      flags: ['--api-key=api-key-flag', '--session-id=session-flag'],
      getConfig: () => lastConfig(handleSessionAttach),
      fromEnv: { apiKey: 'api-key-env', sessionId: 'session-env' },
      fromFlags: { apiKey: 'api-key-flag', sessionId: 'session-flag' },
    },
    {
      name: 'session share',
      args: ['session', 'share'],
      flags: ['--api-key=api-key-flag', '--session-id=session-flag'],
      getConfig: () => lastConfig(handleSessionShare),
      fromEnv: { apiKey: 'api-key-env', sessionId: 'session-env' },
      fromFlags: { apiKey: 'api-key-flag', sessionId: 'session-flag' },
    },
  ];

  describe.each(commands)('$name', (command) => {
    it('reads the environment variables', async () => {
      await parse(command.args, env);

      expect(command.getConfig()).toMatchObject(command.fromEnv);
    });

    it('uses an option over its environment variable', async () => {
      await parse([...command.args, ...command.flags], env);

      expect(command.getConfig()).toMatchObject(command.fromFlags);
    });

    it.each([
      ['false', false],
      ['0', false],
      ['', false],
      ['true', true],
      ['1', true],
    ])('reads CURRENTS_DEBUG=%j as %s', async (value, debug) => {
      await parse(command.args, { ...env, CURRENTS_DEBUG: value });

      expect(command.getConfig()).toMatchObject({ debug });
    });

    it('uses --debug over CURRENTS_DEBUG=false', async () => {
      await parse([...command.args, '--debug'], {
        ...env,
        CURRENTS_DEBUG: 'false',
      });

      expect(command.getConfig()).toMatchObject({ debug: true });
    });
  });

  describe('run upload title tags', () => {
    it.each([
      ['true', true],
      ['false', false],
    ])('reads %j as %s', async (value, expected) => {
      await parse(['run', 'upload'], {
        ...env,
        CURRENTS_REMOVE_TITLE_TAGS: value,
        CURRENTS_DISABLE_TITLE_TAGS: value,
      });

      expect(getCurrentsConfig()).toMatchObject({
        removeTitleTags: expected,
        disableTitleTags: expected,
      });
    });

    it('uses the flags over the environment variables', async () => {
      await parse(
        ['run', 'upload', '--remove-title-tags', '--disable-title-tags'],
        {
          ...env,
          CURRENTS_REMOVE_TITLE_TAGS: 'false',
          CURRENTS_DISABLE_TITLE_TAGS: 'false',
        }
      );

      expect(getCurrentsConfig()).toMatchObject({
        removeTitleTags: true,
        disableTitleTags: true,
      });
    });
  });

  it('ignores CURRENTS_CI_BUILD_ID in run get when --branch is set', async () => {
    await parse(['run', 'get', '--branch=main'], env);

    expect(getAPIGetRunCommandConfig()).toMatchObject({ branch: 'main' });
    expect(getAPIGetRunCommandConfig()?.ciBuildId).toBeUndefined();
  });

  it('reads CURRENTS_DEBUG for convert', async () => {
    const args = [
      'convert',
      '--input-format=junit',
      `--input-file=${reportFile}`,
      '--framework=postman',
    ];
    await parse(args, { CURRENTS_DEBUG: 'false' });
    expect(getConvertCommandConfig()?.debug).toBe(false);

    await parse(args, { CURRENTS_DEBUG: 'true' });
    expect(getConvertCommandConfig()?.debug).toBe(true);
  });
});

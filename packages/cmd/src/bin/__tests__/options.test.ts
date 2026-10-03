import fs from 'fs-extra';
import os from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAPIGetRunCommandConfig } from '../../config/api';
import { getCacheCommandConfig } from '../../config/cache';
import { getCancelCommandConfig } from '../../config/cancel';
import { getConvertCommandConfig } from '../../config/convert';
import { getCurrentsConfig } from '../../config/upload';
import { getProgram } from '../program';

vi.mock('../../services', () => ({
  handleCurrentsReport: vi.fn(),
  handleGetCache: vi.fn(),
  handleSetCache: vi.fn(),
  handleCancelRun: vi.fn(),
  handleGetRun: vi.fn(),
}));
vi.mock('../../services/convert', () => ({ handleConvert: vi.fn() }));

const supportedEnvNames = [
  'CURRENTS_API_KEY',
  'CURRENTS_CI_BUILD_ID',
  'CURRENTS_DEBUG',
  'CURRENTS_DISABLE_TITLE_TAGS',
  'CURRENTS_MACHINE_ID',
  'CURRENTS_OUTPUT',
  'CURRENTS_PROJECT_ID',
  'CURRENTS_RECORD_KEY',
  'CURRENTS_REMOVE_TITLE_TAGS',
  'CURRENTS_REPORT_DIR',
  'CURRENTS_RUN_ID',
  'CURRENTS_TAG',
];

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`);
  }
}

/**
 * Parses the arguments with the real program and real config resolution. The
 * handlers that do the work are mocked, so only the options and the config
 * they resolve to are under test.
 */
async function parse(args: string[], env: Record<string, string> = {}) {
  supportedEnvNames.forEach((name) => vi.stubEnv(name, undefined));
  Object.entries(env).forEach(([name, value]) => vi.stubEnv(name, value));

  try {
    await getProgram().parseAsync(args, { from: 'user' });
  } catch (e) {
    if (!(e instanceof ExitError)) throw e;
  }
}

describe('options and environment variables', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('CURRENTS_DEBUG=false', () => {
    const env = {
      CURRENTS_DEBUG: 'false',
      CURRENTS_RECORD_KEY: 'k',
      CURRENTS_PROJECT_ID: 'p',
      CURRENTS_API_KEY: 'a',
      CURRENTS_CI_BUILD_ID: 'b',
    };

    it('leaves debug off for run cancel', async () => {
      await parse(['run', 'cancel'], env);

      expect(getCancelCommandConfig()?.debug).toBe(false);
    });

    it.each([
      ['run upload', () => getCurrentsConfig()],
      ['cache get', () => getCacheCommandConfig().values],
      ['run get --ci-build-id b', () => getAPIGetRunCommandConfig()],
    ])('leaves debug off for %s', async (command, getConfig) => {
      await parse(command.split(' '), env);

      expect(getConfig()?.debug).toBeFalsy();
    });
  });

  describe('run upload', () => {
    const allEnv = {
      CURRENTS_CI_BUILD_ID: 'build-env',
      CURRENTS_DEBUG: 'true',
      CURRENTS_DISABLE_TITLE_TAGS: 'true',
      CURRENTS_MACHINE_ID: 'machine-env',
      CURRENTS_PROJECT_ID: 'project-env',
      CURRENTS_RECORD_KEY: 'key-env',
      CURRENTS_REMOVE_TITLE_TAGS: 'true',
      CURRENTS_REPORT_DIR: '/report-env',
      CURRENTS_TAG: 'tagA, tagB',
    };

    it('reads every supported environment variable', async () => {
      await parse(['run', 'upload'], allEnv);

      expect(getCurrentsConfig()).toMatchObject({
        ciBuildId: 'build-env',
        machineId: 'machine-env',
        projectId: 'project-env',
        recordKey: 'key-env',
        reportDir: '/report-env',
        tag: ['tagA', 'tagB'],
      });
    });

    it('resolves boolean environment variables to booleans', async () => {
      await parse(['run', 'upload'], allEnv);

      expect(getCurrentsConfig()).toMatchObject({
        debug: true,
        disableTitleTags: true,
        removeTitleTags: true,
      });
    });

    it('uses the flag when the environment variable is also set', async () => {
      await parse(
        [
          'run',
          'upload',
          '--key',
          'key-flag',
          '--project-id',
          'project-flag',
          '--ci-build-id',
          'build-flag',
          '--machine-id',
          'machine-flag',
          '--report-dir',
          '/report-flag',
          '--tag',
          'flagTag',
        ],
        allEnv
      );

      expect(getCurrentsConfig()).toMatchObject({
        recordKey: 'key-flag',
        projectId: 'project-flag',
        ciBuildId: 'build-flag',
        machineId: 'machine-flag',
        reportDir: '/report-flag',
        tag: ['flagTag'],
      });
    });
  });

  describe('run cancel', () => {
    const allEnv = {
      CURRENTS_CI_BUILD_ID: 'build-env',
      CURRENTS_DEBUG: 'true',
      CURRENTS_PROJECT_ID: 'project-env',
      CURRENTS_RECORD_KEY: 'key-env',
      CURRENTS_RUN_ID: 'run-env',
    };

    it('reads every supported environment variable', async () => {
      await parse(['run', 'cancel'], allEnv);

      expect(getCancelCommandConfig()).toEqual({
        ciBuildId: 'build-env',
        debug: true,
        projectId: 'project-env',
        recordKey: 'key-env',
        runId: 'run-env',
      });
    });

    it('uses the flag when the environment variable is also set', async () => {
      await parse(
        [
          'run',
          'cancel',
          '--key',
          'key-flag',
          '--project-id',
          'project-flag',
          '--ci-build-id',
          'build-flag',
          '--run-id',
          'run-flag',
        ],
        allEnv
      );

      expect(getCancelCommandConfig()).toMatchObject({
        recordKey: 'key-flag',
        projectId: 'project-flag',
        ciBuildId: 'build-flag',
        runId: 'run-flag',
      });
    });
  });

  describe('cache set and cache get', () => {
    const allEnv = {
      CURRENTS_DEBUG: 'true',
      CURRENTS_RECORD_KEY: 'key-env',
    };

    it.each(['set', 'get'])(
      'reads every supported environment variable for cache %s',
      async (subcommand) => {
        await parse(['cache', subcommand], allEnv);

        expect(getCacheCommandConfig().values).toMatchObject({
          recordKey: 'key-env',
        });
      }
    );

    it.each(['set', 'get'])(
      'resolves CURRENTS_DEBUG to a boolean for cache %s',
      async (subcommand) => {
        await parse(['cache', subcommand], allEnv);

        expect(getCacheCommandConfig().values).toMatchObject({ debug: true });
      }
    );

    it.each(['set', 'get'])(
      'uses the flag when the environment variable is also set for cache %s',
      async (subcommand) => {
        await parse(['cache', subcommand, '--key', 'key-flag'], allEnv);

        expect(getCacheCommandConfig().values).toMatchObject({
          recordKey: 'key-flag',
        });
      }
    );
  });

  describe('run get', () => {
    const allEnv = {
      CURRENTS_API_KEY: 'api-key-env',
      CURRENTS_DEBUG: 'true',
      CURRENTS_OUTPUT: '/output-env.json',
      CURRENTS_PROJECT_ID: 'project-env',
    };

    it('reads every supported environment variable', async () => {
      await parse(['run', 'get', '--ci-build-id', 'build'], allEnv);

      expect(getAPIGetRunCommandConfig()).toMatchObject({
        apiKey: 'api-key-env',
        debug: true,
        output: '/output-env.json',
        projectId: 'project-env',
      });
    });

    it('uses the flag when the environment variable is also set', async () => {
      await parse(
        [
          'run',
          'get',
          '--ci-build-id',
          'build',
          '--api-key',
          'api-key-flag',
          '--project-id',
          'project-flag',
          '--output',
          '/output-flag.json',
        ],
        allEnv
      );

      expect(getAPIGetRunCommandConfig()).toMatchObject({
        apiKey: 'api-key-flag',
        projectId: 'project-flag',
        output: '/output-flag.json',
      });
    });
  });

  describe('convert', () => {
    let reportFile: string;
    let requiredFlags: string[];

    beforeEach(() => {
      reportFile = join(fs.mkdtempSync(join(os.tmpdir(), 'convert-')), 'r.xml');
      fs.writeFileSync(reportFile, '<testsuites/>');
      requiredFlags = [
        'convert',
        '--input-format',
        'junit',
        '--input-file',
        reportFile,
        '--framework',
        'postman',
      ];
    });

    afterEach(() => {
      fs.removeSync(dirname(reportFile));
    });

    it('reads every supported environment variable', async () => {
      await parse(requiredFlags, { CURRENTS_DEBUG: 'true' });

      expect(getConvertCommandConfig()?.debug).toBeTruthy();
    });

    it('resolves CURRENTS_DEBUG to a boolean', async () => {
      await parse(requiredFlags, { CURRENTS_DEBUG: 'true' });

      expect(getConvertCommandConfig()?.debug).toBe(true);
    });

    it('uses the flag when the environment variable is also set', async () => {
      await parse([...requiredFlags, '--output-dir', '/out'], {
        CURRENTS_DEBUG: 'true',
      });

      expect(getConvertCommandConfig()).toMatchObject({
        outputDir: '/out',
        inputFiles: [reportFile],
        inputFormat: 'junit',
        framework: 'postman',
      });
    });

    it('resolves the same convert config from run upload --input-format', async () => {
      await parse([
        'run',
        'upload',
        '--key',
        'k',
        '--project-id',
        'p',
        ...requiredFlags.slice(1),
        '--output-dir',
        '/out-of-run-upload',
      ]);

      expect(getConvertCommandConfig()).toMatchObject({
        outputDir: '/out-of-run-upload',
        inputFiles: [reportFile],
        inputFormat: 'junit',
        framework: 'postman',
      });
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAPIGetRunCommandConfig } from '../../config/api';
import { getCancelCommandConfig } from '../../config/cancel';
import { getCurrentsConfig } from '../../config/upload';
import {
  handleCancelRun,
  handleCurrentsReport,
  handleGetRun,
} from '../../services';
import { getProgram } from '../program';

vi.mock('../../services', () => ({
  handleCurrentsReport: vi.fn(),
  handleGetRun: vi.fn(),
  handleCancelRun: vi.fn(),
}));

// Each row runs the same options under the hidden root-level path and under
// the new path. Both must resolve the same config and exit with the same code.
const rows = [
  {
    legacy: ['upload'],
    current: ['run', 'upload'],
    handler: vi.mocked(handleCurrentsReport),
    args: ['--key', 'k', '--project-id', 'p', '--ci-build-id', 'b', '-t', 'x'],
    env: { CURRENTS_MACHINE_ID: 'm1', CURRENTS_REPORT_DIR: 'env-reports' },
    readConfig: getCurrentsConfig,
    deprecationWarning: false,
  },
  {
    legacy: ['api', 'get-run'],
    current: ['run', 'get'],
    handler: vi.mocked(handleGetRun),
    args: ['--api-key', 'a', '--project-id', 'p', '--ci-build-id', 'b'],
    env: { CURRENTS_OUTPUT: 'env-out.json' },
    readConfig: getAPIGetRunCommandConfig,
    deprecationWarning: false,
  },
  {
    legacy: ['cancel'],
    current: ['run', 'cancel'],
    handler: vi.mocked(handleCancelRun),
    args: ['--key', 'k', '--project-id', 'p', '--ci-build-id', 'b'],
    env: { CURRENTS_RUN_ID: 'env-run-id' },
    readConfig: getCancelCommandConfig,
    deprecationWarning: true,
  },
];

describe.each(rows)(
  'currents $legacy and currents $current',
  ({ legacy, current, handler, args, env, readConfig, deprecationWarning }) => {
    let stderr: string;

    beforeEach(() => {
      vi.clearAllMocks();
      stderr = '';
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('CURRENTS_')) vi.stubEnv(key, undefined);
      }
      vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderr += String(chunk);
        return true;
      });
      vi.spyOn(console, 'error').mockImplementation((...messages) => {
        stderr += messages.join(' ') + '\n';
      });
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    const run = async (path: string[], options: string[]) => {
      stderr = '';
      await getProgram().parseAsync([...path, ...options], { from: 'user' });
      return {
        exitCode: vi.mocked(process.exit).mock.lastCall?.[0],
        stderr,
      };
    };

    it('resolve the same config from options', async () => {
      const legacyResult = await run(legacy, args);
      const legacyConfig = structuredClone(readConfig());
      const currentResult = await run(current, args);

      expect(legacyConfig).toEqual(readConfig());
      expect(legacyResult.exitCode).toBe(0);
      expect(currentResult.exitCode).toBe(0);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('resolve the same config from environment variables', async () => {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

      await run(legacy, args);
      const legacyConfig = structuredClone(readConfig());
      await run(current, args);

      expect(legacyConfig).toEqual(readConfig());
      for (const value of Object.values(env)) {
        expect(JSON.stringify(legacyConfig)).toContain(value);
      }
    });

    it('exit with 1 when the command fails', async () => {
      handler.mockRejectedValue(new Error('boom'));

      const legacyResult = await run(legacy, args);
      const currentResult = await run(current, args);

      expect(legacyResult.exitCode).toBe(1);
      expect(currentResult.exitCode).toBe(1);
      expect(legacyResult.stderr).toContain('boom');
      expect(currentResult.stderr).toContain('boom');
    });

    it(`${deprecationWarning ? 'warns' : 'does not warn'} on the legacy path only`, async () => {
      const legacyResult = await run(legacy, args);
      const currentResult = await run(current, args);

      expect(legacyResult.stderr.includes('deprecated')).toBe(
        deprecationWarning
      );
      expect(currentResult.stderr).not.toContain('deprecated');
    });
  }
);

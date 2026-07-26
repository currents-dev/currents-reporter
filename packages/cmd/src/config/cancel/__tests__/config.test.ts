import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCancelCommandConfig, setCancelCommandConfig } from '../config';

describe('setCancelCommandConfig', () => {
  beforeEach(() => {
    // Environment values win over the options passed here, so clear the ones a
    // developer running the suite may have exported.
    vi.stubEnv('CURRENTS_RECORD_KEY', undefined);
    vi.stubEnv('CURRENTS_PROJECT_ID', undefined);
    vi.stubEnv('CURRENTS_CI_BUILD_ID', undefined);
    vi.stubEnv('CURRENTS_RUN_ID', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a ciBuildId on its own', () => {
    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      ciBuildId: 'build-1',
    });

    expect(getCancelCommandConfig()).toMatchObject({ ciBuildId: 'build-1' });
  });

  it('accepts a runId on its own', () => {
    setCancelCommandConfig({
      recordKey: 'key',
      projectId: 'proj',
      runId: 'run-1',
    });

    expect(getCancelCommandConfig()).toMatchObject({ runId: 'run-1' });
  });

  it('rejects a configuration with neither', () => {
    expect(() =>
      setCancelCommandConfig({ recordKey: 'key', projectId: 'proj' })
    ).toThrow('Missing required config variable');
  });

  it('reads the run id from the environment', () => {
    vi.stubEnv('CURRENTS_RUN_ID', 'run-from-env');

    setCancelCommandConfig({ recordKey: 'key', projectId: 'proj' });

    expect(getCancelCommandConfig()).toMatchObject({ runId: 'run-from-env' });
  });
});

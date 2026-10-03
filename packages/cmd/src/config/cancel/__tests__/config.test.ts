import { describe, expect, it } from 'vitest';
import { getCancelCommandConfig, setCancelCommandConfig } from '../config';

describe('setCancelCommandConfig', () => {
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
});

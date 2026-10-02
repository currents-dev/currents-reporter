import { ValidationError } from '@lib/error';
import { error } from '@logger';
import { describe, expect, it, vi } from 'vitest';
import { getValidatedConfig, parseBooleanEnv } from '../utils';

vi.mock('@logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@logger')>()),
  error: vi.fn(),
}));

describe('parseBooleanEnv', () => {
  it.each(['false', 'FALSE', '0', 'no', 'off', ' false '])(
    'reads %j as false',
    (value) => {
      expect(parseBooleanEnv(value)).toBe(false);
    }
  );

  it.each(['true', '1', 'yes', 'on', 'currents:*'])(
    'reads %j as true',
    (value) => {
      expect(parseBooleanEnv(value)).toBe(true);
    }
  );

  it.each([undefined, '', '  '])(
    'leaves %j undefined so a CLI flag still applies',
    (value) => {
      expect(parseBooleanEnv(value)).toBeUndefined();
    }
  );
});

describe('getValidatedConfig', () => {
  const keys = {
    projectId: {
      name: 'Project ID',
      env: 'CURRENTS_PROJECT_ID',
      cli: '--project-id',
    },
    title: { name: 'Title', cli: '--title' },
  };

  it('names the option and the environment variable of a missing value', () => {
    expect(() => getValidatedConfig(keys, ['projectId'], {})).toThrow(
      ValidationError
    );
    expect(vi.mocked(error).mock.lastCall?.[0]).toMatch(
      /Project ID is required: pass .*--project-id.* or set .*CURRENTS_PROJECT_ID/
    );
  });

  it('names only the option when it has no environment variable', () => {
    expect(() => getValidatedConfig(keys, ['title'], {})).toThrow(
      ValidationError
    );
    const message = vi.mocked(error).mock.lastCall?.[0] as string;
    expect(message).toMatch(/Title is required: pass .*--title/);
    expect(message).not.toMatch(/set|environment variable/);
  });
});

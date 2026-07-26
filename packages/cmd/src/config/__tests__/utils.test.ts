import { describe, expect, it } from 'vitest';
import { parseBooleanEnv } from '../utils';

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

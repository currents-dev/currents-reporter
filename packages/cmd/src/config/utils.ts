import { debug as _debug } from '@debug';
import { ValidationError } from '@lib/error';
import { dim, error } from '@logger';

type ConfigKeys = Record<
  string,
  {
    name: string;
    cli: string;
    env?: string;
  }
>;

export function removeUndefined<T extends {}>(obj?: T): T {
  return Object.entries(obj ?? {}).reduce((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }
    return {
      ...acc,
      [key]: value,
    };
  }, {} as T);
}

/**
 * Commander sets a flag to true when its environment variable is set to any
 * value. `CURRENTS_DEBUG=false` has to turn debug off, and an empty value
 * counts as unset.
 */
export function parseBooleanEnv(value?: string): boolean | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}

export function getEnvironmentVariableName<T extends ConfigKeys>(
  configKeys: T,
  variable: keyof T
): string {
  return 'env' in configKeys[variable] && !!configKeys[variable].env
    ? (configKeys[variable].env as string)
    : '';
}

export function getCLIOptionName<T extends ConfigKeys>(
  configKeys: T,
  variable: keyof T
) {
  return configKeys[variable].cli;
}

export function getConfigName<T extends ConfigKeys>(
  configKeys: T,
  variable: keyof T
) {
  return configKeys[variable].name;
}

/**
 * The options already hold the environment variables: commander reads them
 * for every option declared with `.env()`, and a command-line value wins.
 */
export function getValidatedConfig<T extends ConfigKeys, R>(
  configKeys: T,
  mandatoryKeys: (keyof R)[],
  options?: Partial<R>,
  customValidation?: (config: R) => void
) {
  const result = removeUndefined(options) as Partial<R>;

  mandatoryKeys.forEach((i) => {
    if (!result[i]) {
      const key = i as string;
      const env = getEnvironmentVariableName(configKeys, key);
      error(
        `${getConfigName(configKeys, key)} is required: pass ${dim(
          getCLIOptionName(configKeys, key)
        )}${env ? ` or set ${dim(env)}` : ''}`
      );
      throw new ValidationError('Missing required config variable');
    }
  });

  if (typeof customValidation === 'function') {
    customValidation(result as R);
  }

  return result as R;
}

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

export function getValidatedConfig<T extends ConfigKeys, R>(
  configKeys: T,
  mandatoryKeys: (keyof R)[],
  getEnvVariables: () => Partial<
    Record<keyof R, string | string[] | boolean | number | undefined>
  >,
  options?: Partial<R>
) {
  const result = {
    ...removeUndefined(options),
    ...removeUndefined(getEnvVariables()),
  };

  mandatoryKeys.forEach((i) => {
    if (!result[i]) {
      error(
        `${getConfigName(
          configKeys,
          i as string
        )} is required for Currents Reporter. Use the following methods to set the value:
- as environment variable: ${dim(getEnvironmentVariableName(configKeys, i as string))}
- as CLI flag of the command: ${dim(getCLIOptionName(configKeys, i as string))}`
      );
      throw new ValidationError('Missing required config variable');
    }
  });

  return result as R;
}

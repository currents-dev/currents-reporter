export function normalizeTagMatcherValue<T extends string | string[]>(
  value: T,
  options: { removeAtPrefix?: boolean } = { removeAtPrefix: false }
): T {
  if (typeof value === 'string') {
    return (
      options.removeAtPrefix ? removeAtPrefix(value) : ensureAtPrefix(value)
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map((v) => normalizeTagMatcherValue(v, options)) as T;
  }

  return value;
}

function ensureAtPrefix(str: string): string {
  return str.startsWith('@') ? str : `@${str}`;
}

function removeAtPrefix(str: string): string {
  return str.startsWith('@') ? str.slice(1) : str;
}

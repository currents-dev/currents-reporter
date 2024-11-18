export function argvToString(argv: Record<string, any>) {
  let args = [];

  for (const [key, value] of Object.entries(argv)) {
    if (key === '_' || key === '$0' || key.includes('-')) continue; // skip _, script name and the kebab case properties added by yargs

    if (typeof value === 'boolean') {
      if (value) {
        args.push(`--${key}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((val) => {
        args.push(`--${key}=${val}`);
      });
    } else {
      args.push(`--${key}=${value}`);
    }
  }

  return args.join(' ');
}

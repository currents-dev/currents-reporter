export function getJestArgv() {
  const args = process.argv.slice(2);
  const options: Record<string, unknown> = {};
  const positional: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      // Handle short flags like -t
      const key = arg.slice(1);
      options[key] = true;
    } else {
      // Positional argument
      positional.push(arg);
    }
  }

  return {
    ...options,
    _: positional,
    $0: process.argv[1] || 'jest',
  };
}

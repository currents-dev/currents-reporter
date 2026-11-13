const hooks: (() => Promise<void>)[] = [];

/** Runs once, when the command ends, before the process exits. */
export function addExitHook(hook: () => Promise<void>) {
  hooks.push(hook);
}

/** A hook that throws is ignored: it does not change the exit code. */
export async function runExitHooks() {
  for (const hook of hooks.splice(0)) {
    try {
      await hook();
    } catch {}
  }
}

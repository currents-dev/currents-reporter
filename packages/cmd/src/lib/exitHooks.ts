import { constants } from 'os';

const hooks: (() => Promise<void>)[] = [];
const signals = ['SIGINT', 'SIGTERM'] as const;
let running: Promise<void> = Promise.resolve();

/**
 * Runs once, when the command ends, before the process exits. A CI provider
 * cancels a job with SIGINT or SIGTERM, so the hooks also run on these
 * signals, while any hook is waiting.
 */
export function addExitHook(hook: () => Promise<void>) {
  if (hooks.length === 0) {
    signals.forEach((signal) => process.on(signal, onSignal));
  }
  hooks.push(hook);
}

/** A hook that throws is ignored: it does not change the exit code. */
export function runExitHooks() {
  const batch = hooks.splice(0);
  running = running.then(async () => {
    for (const hook of batch) {
      try {
        await hook();
      } catch {}
    }
    if (hooks.length === 0) {
      removeSignalHandlers();
    }
  });
  return running;
}

function removeSignalHandlers() {
  signals.forEach((signal) => process.off(signal, onSignal));
}

// Without a handler, a second signal stops the process at once. The exit code
// is the one a shell reports for a process stopped by the signal.
function onSignal(signal: NodeJS.Signals) {
  removeSignalHandlers();
  void runExitHooks().finally(() =>
    process.exit(128 + constants.signals[signal])
  );
}

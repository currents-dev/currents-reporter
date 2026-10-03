import { Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/session';
import { getEnvironmentVariableName } from '../../config/utils';
import { parseCommaSeparatedList } from '../utils';

const env = (key: keyof typeof configKeys) =>
  getEnvironmentVariableName(configKeys, key);

export const apiKeyOption = new Option(
  '--api-key <api-key>',
  'API key with write access, from the Currents dashboard'
).env(env('apiKey'));

export const recordKeyOption = new Option(
  '-k, --key <record-key>',
  'your secret Record Key obtained from Currents; used instead of --api-key when both are set'
).env(env('recordKey'));

export const projectOption = new Option(
  '-p, --project-id <project>',
  'the project ID (required)'
).env(env('projectId'));

export const ciBuildIdOption = new Option(
  '--ci-build-id <id>',
  'the CI build ID the run was recorded with; on a CI provider that reporters detect it can be left out'
).env(env('ciBuildId'));

export const machineIdOption = new Option(
  '--machine-id <id>',
  'identifies the CI machine the files come from; run-level files are listed by it'
).env(env('machineId'));

export const sessionIdOption = new Option(
  '--session-id <id>',
  'the session to use instead of the one saved by "session start"'
).env(env('sessionId'));

export const titleOption = new Option(
  '--title <text>',
  'what the session shows, used as the session title (required)'
);

export const statusOption = new Option(
  '--status <status>',
  'the result of the session'
)
  .choices(['passed', 'failed'] as const)
  .default('passed' as const);

export const errorOption = new Option(
  '--error <text>',
  'what went wrong, for a failed session'
);

export const tagOption = new Option(
  '-t, --tag <tag>',
  'tag the session; comma-separated or repeated'
).argParser(parseCommaSeparatedList);

export const prOption = new Option(
  '--pr <url|number>',
  'the pull request the session is about; by default taken from the CI environment'
);

export const jsonOption = new Option(
  '--json',
  'print the session ID as JSON on stdout, e.g. {"sessionId": "..."}'
);

export const specOption = new Option(
  '--spec <spec>',
  'attach to this spec file of the run'
);

export const testTitleOption = new Option(
  '--test-title <title>',
  'attach to this test of --spec: the full title joined with " > ", or its last part'
);

export const groupOption = new Option(
  '--group <id>',
  'the group of the spec file; a spec that runs once per Playwright project matches more than once without it'
);

export const attemptOption = new Option(
  '--attempt <n>',
  'attach to this attempt of the test (starts at 0)'
).argParser((value) => {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('--attempt must be a whole number from 0');
  }
  return attempt;
});

export const typeOption = new Option(
  '--type <type>',
  'file type; by default picked from the file: a .zip holding trace.trace is a trace, and a folder with trace-*.trace files (or a traces/ subfolder) is packed into one; .png .jpg .webp .gif are screenshots, .webm and .mp4 are videos. Anything else, or a type the target does not take, is an attachment'
).choices(['trace', 'screenshot', 'video', 'attachment'] as const);

export const captionOption = new Option(
  '--caption <text>',
  'a short description shown with each file'
);

const collectMeta = (value: string, previous: string[] = []) => [
  ...previous,
  value,
];

export const metaOption = new Option(
  '--meta <key=value>',
  'a label for each file; repeat for more'
).argParser(collectMeta);

export const expiresInDaysOption = new Option(
  '--expires-in-days <days>',
  'the number of days the link works'
)
  .choices(['1', '3', '7'] as const)
  .argParser((value) => Number(value));

export const debugOption = new Option('--debug', 'enable debug logs')
  .env(env('debug'))
  .default(false);

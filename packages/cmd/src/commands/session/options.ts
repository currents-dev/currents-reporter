import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/session';
import { getEnvironmentVariableName } from '../../config/utils';
import { recordedCiBuildIdOption, tagOption } from '../options';

const env = (key: keyof typeof configKeys) =>
  getEnvironmentVariableName(configKeys, key);

export const RECORD_KEY_NOTE =
  '(required unless --api-key is set or the CI job has an OIDC token: id-token: write on GitHub Actions, or --oidc-token with the Currents URL as its audience)';
export const API_KEY_NOTE = '(used when --key is not set; needs write access)';

export const ciBuildIdOption = recordedCiBuildIdOption(
  '. Leave it out only if the run was recorded without one, on a CI the reporters recognize'
);

export const machineIdOption = new Option(
  '--machine-id <id>',
  'the CI machine the files come from; run-level files are listed by machine when it is set'
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

export const sessionTagOption = tagOption('tags to add to the session');

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

function parseAttempt(value: string) {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('--attempt must be a whole number from 0');
  }
  return attempt;
}

export const attemptOption = new Option(
  '--attempt <n>',
  'attach to this attempt of the test; the first attempt is 0'
).argParser(parseAttempt);

const FILE_TYPES = ['trace', 'screenshot', 'video', 'attachment'] as const;

const TYPE_FROM_FILE =
  'by default taken from the file: a .zip holding trace.trace is a trace; .png, .jpg, .jpeg, .webp and .gif are screenshots; .webm and .mp4 are videos; anything else is an attachment';

export const sessionTypeOption = new Option(
  '--type <type>',
  `the type of every file; ${TYPE_FROM_FILE}`
).choices(FILE_TYPES);

export const runTypeOption = new Option(
  '--type <type>',
  `the type of every file; ${TYPE_FROM_FILE}. The whole run and a test take attachments only, a spec file also takes screenshots and videos, and an attempt (--attempt) takes all four types, including traces. A file of a type its target does not take is attached as an attachment, and a --type the target does not take is an error`
).choices(FILE_TYPES);

export const PATHS_DESCRIPTION =
  'files or folders to attach. A folder adds every file under it, named by its path in the folder, such as login-chromium/trace.zip, so a Playwright test-results folder attaches in one go; hidden files and folders, links and empty files in it are skipped. A folder of Playwright MCP trace-*.trace files, at the top or inside, is packed into one trace and nothing else in it is attached. At most 200 files, each at most 1 GiB; files named .env or .env.* are refused';

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

const EXPIRES_IN_DAYS = ['1', '3', '7'];

// .argParser replaces the check of .choices, so the parser checks the value.
const getExpiresInDaysOption = (description: string) =>
  new Option('--expires-in-days <days>', description)
    .choices(EXPIRES_IN_DAYS)
    .argParser((value) => {
      if (!EXPIRES_IN_DAYS.includes(value)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${EXPIRES_IN_DAYS.join(', ')}.`
        );
      }
      return Number(value);
    });

export const expiresInDaysOption = getExpiresInDaysOption(
  'the number of days the link works'
).default(7);

// No default value: without the option the API picks the number of days for
// the purpose.
export const shareExpiresInDaysOption = getExpiresInDaysOption(
  'the number of days the link works; by default 7 for report and 1 for fix'
);

export const instanceIdOption = new Option(
  '--instance-id <id>',
  'one spec file of the run (default: the whole run)'
);

export const testIdOption = new Option(
  '--test-id <id>',
  'one test of the spec file; needs --instance-id'
);

export const shareAttemptOption = new Option(
  '--attempt <n>',
  'one attempt of the test, from 0; needs --test-id and --purpose fix (default: the last attempt that failed)'
).argParser(parseAttempt);

export const purposeOption = new Option(
  '--purpose <purpose>',
  'report: every test with its attempts and files, for a person\nfix: the failure context, for an agent fixing the tests'
)
  .choices(['report', 'fix'] as const)
  .default('report' as const);

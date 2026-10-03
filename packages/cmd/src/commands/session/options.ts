import { InvalidArgumentError, Option } from '@commander-js/extra-typings';
import { configKeys } from '../../config/session';
import { getEnvironmentVariableName } from '../../config/utils';
import { recordedCiBuildIdOption, tagOption } from '../options';

const env = (key: keyof typeof configKeys) =>
  getEnvironmentVariableName(configKeys, key);

export const WRITE_ACCESS = '(required; needs write access)';

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

export const attemptOption = new Option(
  '--attempt <n>',
  'attach to this attempt of the test; the first attempt is 0'
).argParser((value) => {
  const attempt = Number(value);
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error('--attempt must be a whole number from 0');
  }
  return attempt;
});

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
  'files or folders to attach. A folder adds the files directly in it; hidden files, links, subfolders and empty files in it are skipped. A folder of Playwright MCP trace-*.trace files is packed into one trace and nothing else in it is attached; a folder with such a traces/ subfolder adds the packed trace and its own files. Files named .env or .env.* are refused, and each file can be at most 1 GiB';

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
export const expiresInDaysOption = new Option(
  '--expires-in-days <days>',
  'the number of days the link works'
)
  .choices(EXPIRES_IN_DAYS)
  .default(7)
  .argParser((value) => {
    if (!EXPIRES_IN_DAYS.includes(value)) {
      throw new InvalidArgumentError(
        `Allowed choices are ${EXPIRES_IN_DAYS.join(', ')}.`
      );
    }
    return Number(value);
  });

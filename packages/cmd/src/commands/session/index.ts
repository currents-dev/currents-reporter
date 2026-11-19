import { Command } from '@commander-js/extra-typings';
import {
  getSessionAttachConfig,
  getSessionShareConfig,
  getSessionStartConfig,
} from '../../config/session';
import {
  handleSessionAttach,
  handleSessionShare,
  handleSessionStart,
} from '../../services/session';
import { formatExamples, HelpExample } from '../help';
import { commandHandler, printLogsToStderr } from '../utils';
import {
  apiKeyOption,
  debugOption,
  projectOption,
  recordKeyOption,
} from '../options';
import {
  API_KEY_NOTE,
  captionOption,
  errorOption,
  expiresInDaysOption,
  jsonOption,
  metaOption,
  PATHS_DESCRIPTION,
  prOption,
  RECORD_KEY_NOTE,
  sessionIdOption,
  sessionTagOption,
  sessionTypeOption,
  statusOption,
  titleOption,
} from './options';

const COMMAND_NAME = 'session';

export const getSessionExamples = (name: string) => {
  const start = `${name} ${COMMAND_NAME} start --api-key <api-key> --project-id <id> --title "Checkout fails on empty cart" --status failed`;
  const attach = `${name} ${COMMAND_NAME} attach before.png .playwright-mcp/traces`;
  const share = `${name} ${COMMAND_NAME} share --expires-in-days 7`;
  return {
    session: [
      {
        comment:
          'Start a session, attach what you captured and get a link to share',
        commands: [start, attach, share],
      },
    ],
    start: [
      { comment: 'Start a session for a failed check', commands: [start] },
    ],
    attach: [
      {
        comment: 'Attach a screenshot and a Playwright MCP trace folder',
        commands: [attach],
      },
    ],
    share: [
      { comment: 'Print a link that expires in 7 days', commands: [share] },
    ],
  } satisfies Record<string, HelpExample[]>;
};

const getStartCommand = (name: string) =>
  new Command()
    .name('start')
    .addHelpText('after', formatExamples(getSessionExamples(name).start))
    .summary('Create a session')
    .description(
      'Create a session and save its ID to .currents-session/session.json in the current folder, where "attach" and "share" read it'
    )
    .addOption(recordKeyOption(RECORD_KEY_NOTE))
    .addOption(apiKeyOption(API_KEY_NOTE))
    .addOption(projectOption())
    .addOption(titleOption)
    .addOption(statusOption)
    .addOption(errorOption)
    .addOption(sessionTagOption)
    .addOption(prOption)
    .addOption(jsonOption)
    .addOption(debugOption())
    .action(async (options) => {
      await commandHandler(async ({ key, ...opts }) => {
        if (opts.json) {
          printLogsToStderr();
        }
        await handleSessionStart(
          getSessionStartConfig({ ...opts, recordKey: key })
        );
      }, options);
    });

const getAttachCommand = (name: string) =>
  new Command()
    .name('attach')
    .summary('Upload screenshots, traces and other files')
    .addHelpText('after', formatExamples(getSessionExamples(name).attach))
    .description(
      'Upload files, folders or a Playwright MCP trace folder to the session'
    )
    .argument('<paths...>', PATHS_DESCRIPTION)
    .addOption(recordKeyOption(RECORD_KEY_NOTE))
    .addOption(apiKeyOption(API_KEY_NOTE))
    .addOption(sessionIdOption)
    .addOption(sessionTypeOption)
    .addOption(captionOption)
    .addOption(metaOption)
    .addOption(debugOption())
    .action(async (paths, options) => {
      await commandHandler(async ({ key, ...opts }) => {
        await handleSessionAttach(
          getSessionAttachConfig({ ...opts, recordKey: key }),
          paths
        );
      }, options);
    });

const getShareCommand = (name: string) =>
  new Command()
    .name('share')
    .addHelpText('after', formatExamples(getSessionExamples(name).share))
    .summary('Print a public link to the session page')
    .description(
      'Create a public link to the session page and print it. The second line, "Markdown: <url>", is the address of the same content as Markdown, for agents'
    )
    .addOption(recordKeyOption(RECORD_KEY_NOTE))
    .addOption(apiKeyOption(API_KEY_NOTE))
    .addOption(sessionIdOption)
    .addOption(expiresInDaysOption)
    .addOption(debugOption())
    .action(async (options) => {
      await commandHandler(async ({ key, ...opts }) => {
        await handleSessionShare(
          getSessionShareConfig({ ...opts, recordKey: key })
        );
      }, options);
    });

export const getSessionCommand = (name: string) =>
  new Command()
    .name(COMMAND_NAME)
    .summary('Capture agent or browser sessions as evidence')
    .description(
      'Capture ad-hoc, one-off agent or browser sessions as evidence: a bug before and after a fix, or proof that something works. Create a session, attach screenshots, traces, videos and other files to it, and print a link to share it.'
    )
    .addHelpText('after', formatExamples(getSessionExamples(name).session))
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getStartCommand(name))
    .addCommand(getAttachCommand(name))
    .addCommand(getShareCommand(name));

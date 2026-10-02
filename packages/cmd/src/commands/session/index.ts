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
import { commandHandler } from '../utils';
import {
  apiKeyOption,
  captionOption,
  debugOption,
  errorOption,
  expiresInDaysOption,
  jsonOption,
  metaOption,
  prOption,
  projectOption,
  sessionIdOption,
  statusOption,
  tagOption,
  titleOption,
  typeOption,
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
    .summary('Create a session and save its ID')
    .description(
      'Create a session and save its ID to .currents-session/session.json for "attach" and "share"'
    )
    .addOption(apiKeyOption)
    .addOption(projectOption)
    .addOption(titleOption)
    .addOption(statusOption)
    .addOption(errorOption)
    .addOption(tagOption)
    .addOption(prOption)
    .addOption(jsonOption)
    .addOption(debugOption)
    .action(async (options) => {
      await commandHandler(async (opts) => {
        if (opts.json) {
          // The logger prints to stdout; with --json only the JSON may be there.
          console.log = (...args: unknown[]) => console.error(...args);
        }
        await handleSessionStart(getSessionStartConfig(opts));
      }, options);
    });

const getAttachCommand = (name: string) =>
  new Command()
    .name('attach')
    .summary('Upload files and folders to the session')
    .addHelpText('after', formatExamples(getSessionExamples(name).attach))
    .description(
      'Upload files, folders or a Playwright MCP trace folder to the session'
    )
    .argument('<paths...>', 'files or folders to attach')
    .addOption(apiKeyOption)
    .addOption(sessionIdOption)
    .addOption(typeOption)
    .addOption(captionOption)
    .addOption(metaOption)
    .addOption(debugOption)
    .action(async (paths, options) => {
      await commandHandler(async (opts) => {
        await handleSessionAttach(getSessionAttachConfig(opts), paths);
      }, options);
    });

const getShareCommand = (name: string) =>
  new Command()
    .name('share')
    .addHelpText('after', formatExamples(getSessionExamples(name).share))
    .description('Print a public link to the session page')
    .addOption(apiKeyOption)
    .addOption(sessionIdOption)
    .addOption(expiresInDaysOption)
    .addOption(debugOption)
    .action(async (options) => {
      await commandHandler(async (opts) => {
        await handleSessionShare(getSessionShareConfig(opts));
      }, options);
    });

export const getSessionCommand = (name: string) =>
  new Command()
    .name(COMMAND_NAME)
    .description('Record a browser session and share it')
    .addHelpText('after', formatExamples(getSessionExamples(name).session))
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getStartCommand(name))
    .addCommand(getAttachCommand(name))
    .addCommand(getShareCommand(name));

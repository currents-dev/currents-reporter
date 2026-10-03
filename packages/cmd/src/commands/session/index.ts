import { Command } from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
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

const getExample = (name: string) => `

${chalk.bold('Examples')}

Start a session, attach what you captured and get a link to share:
${dim(`${name} ${COMMAND_NAME} start --api-key <api-key> --project-id <id> --title "Checkout fails on empty cart" --status failed`)}
${dim(`${name} ${COMMAND_NAME} attach before.png .playwright-mcp/traces`)}
${dim(`${name} ${COMMAND_NAME} share --expires-in-days 7`)}

`;

const getStartCommand = () =>
  new Command()
    .name('start')
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

const getAttachCommand = () =>
  new Command()
    .name('attach')
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

const getShareCommand = () =>
  new Command()
    .name('share')
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
    .description(`Record a browser session and share it ${getExample(name)}`)
    .showHelpAfterError('(add --help for additional information)')
    .addCommand(getStartCommand())
    .addCommand(getAttachCommand())
    .addCommand(getShareCommand());

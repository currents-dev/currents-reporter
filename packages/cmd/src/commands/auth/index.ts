import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import { handleLogin, handleLogout, handleWhoami } from '../../services/auth';
import { formatExamples } from '../help';
import { debugOption } from '../options';
import { commandHandler } from '../utils';

const timeoutOption = new Option(
  '--timeout <seconds>',
  'stop waiting for the approval in the browser after this many seconds (default: 600)'
).argParser((value) => {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new InvalidArgumentError('Must be a whole number of seconds.');
  }
  return seconds;
});

export const getLoginCommand = (name: string) =>
  new Command()
    .name('login')
    .summary('Log in to Currents in the browser')
    .description(
      'Log in to Currents in the browser and store the login in ~/.config/currents/credentials.json, or in credentials.json in CURRENTS_CONFIG_DIR. `currents api` and `currents run get` use it when neither --api-key nor CURRENTS_API_KEY is set. The login can read runs and projects.'
    )
    .addHelpText(
      'after',
      formatExamples([
        { comment: 'Open the browser to log in', commands: [`${name} login`] },
        {
          comment: 'Print the link only, e.g. on a machine without a browser',
          commands: [`${name} login --no-browser`],
        },
      ])
    )
    .option('--no-browser', 'print the link without opening a browser')
    .addOption(timeoutOption)
    .addOption(debugOption())
    .action(async (options) => {
      await commandHandler(
        (opts) =>
          handleLogin({ browser: opts.browser, timeoutSeconds: opts.timeout }),
        options
      );
    });

export const getLogoutCommand = () =>
  new Command()
    .name('logout')
    .summary('Revoke and delete the stored login')
    .description(
      'Revoke the stored login on the server and delete it from this machine'
    )
    .addOption(debugOption())
    .action(async (options) => {
      await commandHandler(() => handleLogout(), options);
    });

export const getWhoamiCommand = () =>
  new Command()
    .name('whoami')
    .summary('Show the organization and scopes of the stored login')
    .description(
      'Show the REST API, organization, role and scopes of the stored login'
    )
    .addOption(debugOption())
    .action(async (options) => {
      await commandHandler(() => handleWhoami(), options);
    });

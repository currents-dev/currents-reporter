import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import { dim } from '@logger';
import chalk from 'chalk';
import { getRestAPIBaseUrl } from '../../http/httpConfig';
import {
  handleLogin,
  handleLogout,
  handleSetup,
  handleSignup,
  handleWhoami,
} from '../../services/auth';
import { commandHandler } from '../utils';
import { progressFor, runAccountCommand } from './output';

const apiUrlOption = new Option('--api-url <url>', 'Currents REST API URL').env(
  'CURRENTS_REST_API_URL'
);

const noBrowserOption = new Option(
  '--no-browser',
  'Print the link without opening a browser'
);

const debugOption = new Option('--debug', 'Enable debug logging').default(
  false
);

const jsonOption = new Option(
  '--json',
  'Print one JSON object with ok, data and next_steps to stdout; progress goes to stderr'
).default(false);

const forceOption = new Option(
  '--force',
  'Replace a stored login for the same API URL'
).default(false);

const timeoutOption = (what: string) =>
  new Option(
    '--timeout <seconds>',
    `Stop waiting after this many seconds and exit with code 2; ${what}`
  ).argParser((value) => {
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new InvalidArgumentError('Must be a whole number of seconds.');
    }
    return seconds;
  });

const EXIT_CODES = `${chalk.bold('Exit codes')}

0 ok · 1 unexpected error · 2 waiting for the person to confirm or approve · 3 not logged in · 4 refused (address not allowed, rate limited) · 5 account already exists
`;

const resolveApiUrl = (apiUrl: string | undefined) =>
  (apiUrl ?? getRestAPIBaseUrl()).replace(/\/+$/, '');

export const getLoginCommand = (name: string) =>
  new Command()
    .name('login')
    .description(
      `Log this CLI in to an existing Currents account in the browser

${chalk.bold('Examples')}

Open the browser to log in:
${dim(`${name} login`)}

Print the link only, e.g. for an AI agent to pass on:
${dim(`${name} login --no-browser --json`)}

${EXIT_CODES}`
    )
    .addOption(apiUrlOption)
    .addOption(noBrowserOption)
    .addOption(timeoutOption('run the command again to start over'))
    .addOption(forceOption)
    .addOption(jsonOption)
    .addOption(debugOption)
    .action((options) =>
      runAccountCommand(
        () =>
          handleLogin({
            apiUrl: resolveApiUrl(options.apiUrl),
            browser: options.browser,
            timeoutSeconds: options.timeout,
            force: options.force,
            onProgress: progressFor(options.json),
          }),
        options
      )
    );

export const getSignupCommand = (name: string) =>
  new Command()
    .name('signup')
    .description(
      `Create a Currents account for an email address. Currents emails that address a link to confirm; this command waits for the click and then stores an API key

${chalk.bold('Examples')}

Wait for the confirmation:
${dim(`${name} signup --email dana@acme.com`)}

Start without waiting, then collect the key later, e.g. from an AI agent whose commands time out:
${dim(`${name} signup --email dana@acme.com --no-wait --json`)}
${dim(`${name} signup --resume --json`)}

${EXIT_CODES}`
    )
    .option('--email <email>', 'Email address of the account owner')
    .addOption(
      new Option(
        '--client-name <name>',
        'Name shown in the confirmation email, e.g. the AI agent running this command'
      )
        .env('CURRENTS_CLIENT_NAME')
        .default('Currents CLI')
    )
    .option(
      '--org-name <name>',
      'Suggested organization name; the account owner can change it before confirming'
    )
    .option(
      '--no-wait',
      'Send the email, save the request and exit with code 2 without waiting'
    )
    .option(
      '--resume',
      'Wait for the signup started earlier and store its API key'
    )
    .option(
      '--resend',
      'Send the email of the signup started earlier again, with a new link'
    )
    .addOption(timeoutOption('"--resume" continues'))
    .addOption(forceOption)
    .addOption(apiUrlOption)
    .addOption(jsonOption)
    .addOption(debugOption)
    .action((options) =>
      runAccountCommand(
        () =>
          handleSignup({
            apiUrl: resolveApiUrl(options.apiUrl),
            email: options.email,
            clientName: options.clientName,
            orgName: options.orgName,
            wait: options.wait,
            resume: options.resume,
            resend: options.resend,
            timeoutSeconds: options.timeout,
            force: options.force,
            onProgress: progressFor(options.json),
          }),
        options
      )
    );

export const getLogoutCommand = () =>
  new Command()
    .name('logout')
    .description(
      'Revoke and delete the stored Currents login, and discard a signup waiting for confirmation'
    )
    .option(
      '--keep-remote',
      'Delete the stored login without revoking it on the server'
    )
    .addOption(jsonOption)
    .addOption(debugOption)
    .action((options) =>
      runAccountCommand(
        () => handleLogout({ keepRemote: options.keepRemote }),
        options
      )
    );

export const getWhoamiCommand = () =>
  new Command()
    .name('whoami')
    .description(
      `Show the organization, user, scopes, expiry and projects of the stored login

${EXIT_CODES}`
    )
    .addOption(jsonOption)
    .addOption(debugOption)
    .action((options) => runAccountCommand(() => handleWhoami(), options));

export const getSetupCommand = (name: string) =>
  new Command()
    .name('setup')
    .description(
      `Create a project and write its id and record key to an env file

${chalk.bold('Examples')}

${dim(`${name} setup --project-name my-app`)}
`
    )
    .requiredOption('--project-name <name>', 'Name of the project to create')
    .option('--env-file <path>', 'Env file to write', '.env')
    .addOption(debugOption)
    .action((options) =>
      commandHandler(
        (opts) =>
          handleSetup({ projectName: opts.projectName, envFile: opts.envFile }),
        options
      )
    );

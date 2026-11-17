import { Command, Option } from '@commander-js/extra-typings';
import {
  CiAuthOptions,
  CredentialFor,
  exchangeHandler,
  getCredentialHandler,
  getOidcTokenHandler,
  revokeHandler,
} from '../../services/ciAuth';
import { statusHandler } from '../../services/ciAuth/status';
import { formatExamples, HelpExample } from '../help';
import {
  apiKeyOption,
  debugOption,
  oidcAudienceOption,
  projectOption,
  recordKeyOption,
} from '../options';
import { commandHandler, printLogsToStderr } from '../utils';

const PARENT_NAME = 'ci auth';

/**
 * Commander repeats the value of a rejected option, choice or command in its
 * error, which a CI log keeps. A token passed by mistake, such as
 * `--oidc-token=<jwt>`, would be printed before any GitHub mask.
 */
export const hideParserValues = (message: string) =>
  message
    .replace(/'(--[^'=\s]+)=[^']*'/g, "'$1'")
    .replace(/'(-[^-'\s])[^']+'/g, "'$1'")
    .replace(/argument '[^']*' is invalid/g, "argument '*****' is invalid")
    .replace(/unknown command '[^']*'/g, "unknown command '*****'");

const forOption = (
  description = 'the credential to get: an API token or a record key'
) =>
  new Option('--for <kind>', description)
    .choices(['api', 'record'] as const)
    .makeOptionMandatory();

const jsonOption = () =>
  new Option(
    '--json',
    'print {"token", "expires_at"} as JSON, with "scopes" for an API token'
  );

const stdinOption = (what: string) =>
  new Option('--stdin', `read the ${what} from stdin`);

const oidcApiAudienceOption = () =>
  new Option(
    '--oidc-api-audience <audience>',
    'the audience of the OIDC token for an API token; the default is currents:api. A Currents staging or on-prem install has its own'
  ).env('CURRENTS_OIDC_API_AUDIENCE');

// stdout holds only the credential: logs, such as a retried request, go to stderr.
const ciAuthAction =
  <T extends CiAuthOptions>(handler: (options: T) => Promise<void>) =>
  (options: T) =>
    commandHandler(async (o: T) => {
      printLogsToStderr();
      await handler(o);
    }, options);

export const getCiAuthExamples = (name: string): HelpExample[] => [
  {
    comment:
      'Use an API token from the OIDC token of the job for the commands after it',
    commands: [
      `export CURRENTS_API_KEY=$(${name} ${PARENT_NAME} get-api-token --project-id <project-id>)`,
      `${name} api /v1/runs/<run-id>`,
      `${name} ${PARENT_NAME} revoke`,
    ],
  },
  {
    comment:
      'Say which credentials the Currents commands of this job would use',
    commands: [`${name} ${PARENT_NAME} status`],
  },
  {
    comment:
      'Exchange the GitLab id_token in CURRENTS_OIDC_TOKEN for a record key',
    commands: [
      `${name} ${PARENT_NAME} exchange --for record --project-id <project-id>`,
    ],
  },
];

const getCredentialCommand = (credentialFor: CredentialFor) => {
  const command = new Command()
    .name(credentialFor === 'api' ? 'get-api-token' : 'get-record-key')
    .summary(
      credentialFor === 'api'
        ? 'Print an API token from the OIDC token of the CI job'
        : 'Print a record key from the OIDC token of the CI job'
    )
    .description(
      `Get the OIDC token of the CI job (GitHub Actions with id-token: write, or ${credentialFor === 'api' ? 'CURRENTS_OIDC_API_TOKEN' : 'CURRENTS_OIDC_TOKEN'} on any CI), exchange it and print the ${credentialFor === 'api' ? 'API token' : 'record key'}. It stays valid until it expires or '${PARENT_NAME} revoke' revokes it.`
    )
    .addOption(projectOption())
    .addOption(
      credentialFor === 'api' ? oidcApiAudienceOption() : oidcAudienceOption()
    )
    .addOption(jsonOption())
    .addOption(debugOption());
  return command.action(
    ciAuthAction((options) => getCredentialHandler(credentialFor, options))
  );
};

export const getCiCommand = (name: string) => {
  const auth = new Command()
    .name('auth')
    .summary('Get credentials from the OIDC token of the CI job')
    .description(
      'Get a Currents API token or record key from the OIDC token of the CI job, without a stored secret, and revoke it. The credentials are printed on stdout: keep them out of logs.'
    )
    .addHelpText('after', formatExamples(getCiAuthExamples(name)))
    .helpCommand(false)
    .addCommand(getCredentialCommand('api'))
    .addCommand(getCredentialCommand('record'))
    .addCommand(
      new Command()
        .name('get-oidc-token')
        .summary('Print the OIDC token of the CI job')
        .description(
          'Print the OIDC token of the CI job for an API token (--for api) or a record key (--for record), without exchanging it. On GitHub Actions the CLI requests it with the audience of the kind; on any other CI it prints CURRENTS_OIDC_API_TOKEN or CURRENTS_OIDC_TOKEN as it is. The audience options do not change a token from those variables: the job requests it with the audience it needs.'
        )
        .addOption(forOption('the audience: for an API token or a record key'))
        .addOption(oidcApiAudienceOption())
        .addOption(oidcAudienceOption())
        .addOption(debugOption())
        .action(
          ciAuthAction((options) => getOidcTokenHandler(options.for, options))
        )
    )
    .addCommand(
      new Command()
        .name('status')
        .summary('Say which credentials the Currents commands would use')
        .description(
          'Say which credential API requests and recording would use, the project, and the OIDC audiences. It names the flags and variables, not their values, and requests, exchanges or checks no token.'
        )
        .addOption(apiKeyOption('(its source is reported)'))
        .addOption(recordKeyOption('(its source is reported)'))
        .addOption(projectOption('(reported)'))
        .addOption(oidcApiAudienceOption())
        .addOption(oidcAudienceOption())
        .addOption(debugOption())
        .action((options, command) =>
          commandHandler(async () => {
            printLogsToStderr();
            await statusHandler(options, {
              apiKey: command.getOptionValueSource('apiKey'),
              key: command.getOptionValueSource('key'),
              projectId: command.getOptionValueSource('projectId'),
              oidcApiAudience: command.getOptionValueSource('oidcApiAudience'),
              oidcAudience: command.getOptionValueSource('oidcAudience'),
            });
          }, options)
        )
    )
    .addCommand(
      new Command()
        .name('exchange')
        .summary('Exchange an OIDC token from the environment or stdin')
        .description(
          'Exchange the OIDC token in CURRENTS_OIDC_API_TOKEN (--for api) or CURRENTS_OIDC_TOKEN (--for record), or from stdin, and print the credential'
        )
        .addOption(forOption())
        .addOption(projectOption())
        .addOption(stdinOption('OIDC token'))
        .addOption(jsonOption())
        .addOption(debugOption())
        .action(
          ciAuthAction((options) => exchangeHandler(options.for, options))
        )
    )
    .addCommand(
      new Command()
        .name('revoke')
        .summary('Revoke an API token or record key from an OIDC exchange')
        .description(
          'Revoke the credential from stdin, or the OIDC credentials in CURRENTS_API_KEY and CURRENTS_RECORD_KEY. The prefix tells an API token (crnts_ciapi_) from a record key (crnts_ci_); other keys are not revoked.'
        )
        .addOption(stdinOption('credential'))
        .addOption(debugOption())
        .action(ciAuthAction(revokeHandler))
    );

  const ci = new Command()
    .name('ci')
    .summary('Commands for CI jobs')
    .helpCommand(false)
    .addCommand(auth);
  for (const command of [ci, auth, ...auth.commands]) {
    command.configureOutput({
      outputError: (message, write) => write(hideParserValues(message)),
    });
  }
  return ci;
};

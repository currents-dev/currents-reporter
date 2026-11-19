import {
  Command,
  CommandUnknownOpts,
  Option,
} from '@commander-js/extra-typings';
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
import { OIDC_PROVIDER_ENV, OIDC_PROVIDERS } from '../../lib/oidc';
import {
  apiKeyOption,
  debugOption,
  projectOption,
  recordKeyOption,
} from '../options';
import { commandHandler, printLogsToStderr } from '../utils';

const PARENT_NAME = 'ci auth';

/**
 * Commander repeats the value of a rejected option, choice or command in its
 * error, which a CI log keeps: a token passed by mistake, such as
 * `--oidc-token=<jwt>`, would be printed before any GitHub mask. The message
 * is rebuilt from the error code and the command's own options. Nothing is
 * cut out of the text: an unknown option name can be the token itself, and a
 * value can hold any character.
 */
export function messageWithoutValues(
  command: CommandUnknownOpts,
  message: string,
  code?: string
) {
  switch (code) {
    case 'commander.unknownOption':
      return 'error: unknown option (run with --help to see the options)';
    case 'commander.invalidArgument': {
      const option = command.options.find((o) =>
        message.startsWith(`error: option '${o.flags}' argument `)
      );
      if (!option) return 'error: an option argument is invalid';
      const choices = option.argChoices
        ? ` Allowed choices are ${option.argChoices.join(', ')}.`
        : '';
      return `error: option '${option.flags}' argument is invalid.${choices}`;
    }
    case 'commander.unknownCommand':
      return 'error: unknown command';
    default:
      return message;
  }
}

const forOption = (description: string) =>
  new Option('--for <kind>', description).choices(['api', 'record'] as const);

const optionalProviderOption = () =>
  new Option(
    '--oidc-provider <provider>',
    'the CI provider that issues the OIDC token: github-actions (needs `permissions: id-token: write`), google-cloud (the metadata server of a VM, or of a GKE pod with Workload Identity), circleci (runs `circleci run oidc get`) or buildkite (runs `buildkite-agent oidc request-token`)'
  )
    .choices(OIDC_PROVIDERS)
    .env(OIDC_PROVIDER_ENV);

const providerOption = () => optionalProviderOption().makeOptionMandatory();

const audienceOption = () =>
  new Option(
    '--audience <audience>',
    'the audience of the OIDC token; the default is CURRENTS_OIDC_API_AUDIENCE or currents:api for an API token, CURRENTS_OIDC_AUDIENCE or currents:record-key for a record key. A Currents staging or on-prem install has its own'
  );

const jsonOption = () =>
  new Option(
    '--json',
    'print {"token", "expires_at"} as JSON, with "scopes" for an API token'
  );

const stdinOption = (what: string) =>
  new Option('--stdin', `read the ${what} from stdin`);

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
      'Use an API token from the OIDC token of a GitHub Actions job for the commands after it',
    commands: [
      `export CURRENTS_API_KEY=$(${name} ${PARENT_NAME} get-api-token --oidc-provider github-actions --project-id <project-id>)`,
      `${name} api /v1/runs/<run-id>`,
      `${name} ${PARENT_NAME} revoke`,
    ],
  },
  {
    comment: 'Get the OIDC token and exchange it in two steps',
    commands: [
      `${name} ${PARENT_NAME} get-oidc-token --oidc-provider circleci --for record | ${name} ${PARENT_NAME} exchange --stdin --project-id <project-id>`,
    ],
  },
  {
    comment:
      'Exchange the GitLab id_token in CURRENTS_OIDC_TOKEN; its audience picks the credential',
    commands: [`${name} ${PARENT_NAME} exchange --project-id <project-id>`],
  },
  {
    comment:
      'Say which credentials the Currents commands of this job would use',
    commands: [`${name} ${PARENT_NAME} status`],
  },
];

const getCredentialCommand = (credentialFor: CredentialFor) => {
  const credentialName = credentialFor === 'api' ? 'API token' : 'record key';
  const command = new Command()
    .name(credentialFor === 'api' ? 'get-api-token' : 'get-record-key')
    .summary(
      `Print ${credentialFor === 'api' ? 'an' : 'a'} ${credentialName} from the OIDC token of the CI job`
    )
    .description(
      `Get the OIDC token of the CI job from the provider of --oidc-provider, exchange it and print the ${credentialName}: 'get-oidc-token --for ${credentialFor}' and 'exchange --for ${credentialFor}' in one command. It stays valid until it expires or '${PARENT_NAME} revoke' revokes it.`
    )
    .addOption(providerOption())
    .addOption(audienceOption())
    .addOption(projectOption())
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
          "Request an OIDC token from the provider of --oidc-provider, with the audience of an API token (--for api) or a record key (--for record), and print it without exchanging it. It does not read CURRENTS_OIDC_TOKEN: to exchange a token you hold, use 'exchange'."
        )
        .addOption(providerOption())
        .addOption(
          forOption(
            'the audience: for an API token or a record key'
          ).makeOptionMandatory()
        )
        .addOption(audienceOption())
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
          "Say which key API requests and recording would use, the project, and the OIDC audiences of the 'ci auth' commands. It names the flags and variables, not their values, and requests, exchanges or checks no token. With --oidc-provider google-cloud, it asks the Google Cloud metadata server for the email of its service account, to say whether the server answers."
        )
        .addOption(apiKeyOption('(its source is reported)'))
        .addOption(recordKeyOption('(its source is reported)'))
        .addOption(projectOption('(reported)'))
        .addOption(optionalProviderOption())
        .addOption(debugOption())
        .action((options, command) =>
          commandHandler(async () => {
            printLogsToStderr();
            await statusHandler(
              options,
              {
                apiKey: command.getOptionValueSource('apiKey'),
                key: command.getOptionValueSource('key'),
                projectId: command.getOptionValueSource('projectId'),
                oidcProvider: command.getOptionValueSource('oidcProvider'),
              },
              command
            );
          }, options)
        )
    )
    .addCommand(
      new Command()
        .name('exchange')
        .summary('Exchange an OIDC token from stdin or CURRENTS_OIDC_TOKEN')
        .description(
          'Exchange the OIDC token from stdin (--stdin), or else from CURRENTS_OIDC_TOKEN, and print the credential. The audience of the token picks it: currents:api, or one that starts with currents:api:, for an API token; currents:record-key, or one that starts with currents:record-key:, for a record key. The token is decoded, not verified. Pass --for when the audience is another, or holds both.'
        )
        .addOption(
          forOption('the credential to get, whatever the audience of the token')
        )
        .addOption(projectOption())
        .addOption(stdinOption('OIDC token'))
        .addOption(jsonOption())
        .addOption(debugOption())
        .action(ciAuthAction(exchangeHandler))
    )
    .addCommand(
      new Command()
        .name('revoke')
        .summary('Revoke an API token or record key from an OIDC exchange')
        .description(
          'Revoke the credential from stdin (--stdin), or else the OIDC credentials in CURRENTS_API_KEY and CURRENTS_RECORD_KEY. The prefix tells an API token (crnts_ciapi_) from a record key (crnts_ci_); other keys are not revoked. Every credential is tried; the command fails if one was not revoked.'
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
  for (const command of [ci, auth, ...auth.commands] as CommandUnknownOpts[]) {
    const error = command.error.bind(command);
    command.error = (message, options) =>
      error(messageWithoutValues(command, message, options?.code), options);
  }
  return ci;
};

import { Option } from '@commander-js/extra-typings';
import { sharedConfigKeys } from '../config/keys';
import { parseCommaSeparatedList } from './utils';

// The options several commands share. A command passes the note that says
// when the option is required, so the sentence is the same everywhere.

const REQUIRED = '(required)';

const OIDC =
  'the CI job has an OIDC token: id-token: write on GitHub Actions, or --oidc-token with the Currents URL as its audience';

export const recordKeyOption = (note = `(required unless ${OIDC})`) =>
  new Option(
    '-k, --key <record-key>',
    `the record key from the Currents dashboard ${note}`
  ).env(sharedConfigKeys.recordKey.env);

export const oidcTokenOption = () =>
  new Option(
    '--oidc-token <token>',
    'an OIDC token of the CI job, to get a record key without a stored secret; its audience is the Currents URL. Used when no record key is set'
  ).env('CURRENTS_OIDC_TOKEN');

export const apiKeyOption = (note = REQUIRED) =>
  new Option(
    '--api-key <api-key>',
    `an API key from the Currents dashboard ${note}`
  ).env(sharedConfigKeys.apiKey.env);

export const projectOption = () =>
  new Option(
    '-p, --project-id <id>',
    `the project ID from the Currents dashboard ${REQUIRED}`
  ).env(sharedConfigKeys.projectId.env);

/** For the commands that find a run recorded earlier. */
export const recordedCiBuildIdOption = (note: string) =>
  new Option(
    '--ci-build-id <id>',
    `the CI build ID the run was recorded with${note}`
  ).env(sharedConfigKeys.ciBuildId.env);

export const tagOption = (description: string) =>
  new Option(
    '-t, --tag <tag>',
    `${description}; comma-separated or repeated`
  ).argParser(parseCommaSeparatedList);

export const debugOption = () =>
  new Option('--debug', 'print debug logs; keys are hidden in them')
    .env(sharedConfigKeys.debug.env)
    .default(false);

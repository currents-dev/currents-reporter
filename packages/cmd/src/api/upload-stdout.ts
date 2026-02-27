import { debug as _debug } from '../debug';
import { makeRequest } from '../http';
import { ClientType } from '../http/client';
import { RunCreationConfig } from './create-run';

const debug = _debug.extend('api');

export async function uploadStdout(
  instanceId: string,
  stdout: string,
  config: RunCreationConfig
) {
  debug(
    `Uploading stdout for instance ${instanceId} with ${stdout.length} bytes`
  );
  try {
    return await makeRequest<void, { stdout: string }>(ClientType.API, {
      url: `instances/${instanceId}/stdout`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      data: { stdout },
    });
  } catch (e) {
    debug('Error uploading stdout: %o', e);
    throw e;
  }
}

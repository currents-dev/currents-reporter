import { Action } from '@currents/rules';
import { debug as _debug } from '../debug';
import { makeRequest } from '../http';
import { ClientType } from '../http/client';

const debug = _debug.extend('api');

export type GetProjectActionsResponse = {
  rules: Action[];
};

/**
 * The active actions of a project. The API leaves out the actions with regex
 * or date conditions unless the client is @currents/playwright 1.18 or later.
 */
export async function getProjectActions(projectId: string, recordKey: string) {
  try {
    return await makeRequest<GetProjectActionsResponse>(ClientType.API, {
      url: `rules/project/${encodeURIComponent(projectId)}`,
      method: 'GET',
      headers: {
        'x-currents-key': recordKey,
      },
    }).then((res) => res.data.rules);
  } catch (err) {
    debug('Failed to get the project actions:', err);
    throw err;
  }
}

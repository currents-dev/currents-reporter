import { debug } from '@debug';
import { isAxiosError } from 'axios';
import { cancelRun } from '../../api';
import { getCancelCommandConfig } from '../../config/cancel';
import { info } from '../../logger';

export async function handleCancelRun() {
  const config = getCancelCommandConfig();
  if (!config) {
    throw new Error('Config is missing!');
  }

  try {
    const result = await cancelRun({
      recordKey: config.recordKey,
      projectId: config.projectId,
      ciBuildId: config.ciBuildId,
    });

    info(
      'Run "%s" (ciBuildId: %s) is cancelled',
      result.data.runId,
      config.ciBuildId
    );

    return result;
  } catch (e) {
    // A job cancelled before it recorded anything has no run. The command runs
    // on the cancellation path, so exiting non-zero here would put a failed
    // step on an already cancelled job.
    if (isAxiosError(e) && e.response?.status === 404) {
      info(
        'No run to cancel for ciBuildId "%s" in project "%s"',
        config.ciBuildId,
        config.projectId
      );
      return null;
    }

    debug('Failed to cancel the run');
    throw e;
  }
}

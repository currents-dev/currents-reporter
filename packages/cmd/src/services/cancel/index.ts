import { debug } from '@debug';
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
    debug('Failed to cancel the run');
    throw e;
  }
}

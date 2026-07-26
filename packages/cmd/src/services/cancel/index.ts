import { debug } from '@debug';
import { cancelRun } from '../../api';
import { getCancelCommandConfig } from '../../config/cancel';
import { info } from '../../logger';

export async function handleCancelRun() {
  const config = getCancelCommandConfig();
  if (!config) {
    throw new Error('Config is missing!');
  }

  // Names the run the way the caller asked for it, so the output matches what
  // was passed rather than always reporting a ciBuildId.
  const requestedAs = config.runId
    ? `runId: ${config.runId}`
    : `ciBuildId: ${config.ciBuildId}`;

  try {
    const result = await cancelRun({
      recordKey: config.recordKey,
      projectId: config.projectId,
      ciBuildId: config.ciBuildId,
      runId: config.runId,
    });

    // A job cancelled before it recorded anything has no run, which the cloud
    // reports as a success with no run id. The command runs on the cancellation
    // path, so there is nothing left to do and nothing to fail about.
    if (!result.data.runId) {
      info(
        'No run to cancel (%s) in project "%s"',
        requestedAs,
        config.projectId
      );
    } else {
      info('Run "%s" (%s) is cancelled', result.data.runId, requestedAs);
    }

    return result;
  } catch (e) {
    debug('Failed to cancel the run');
    throw e;
  }
}

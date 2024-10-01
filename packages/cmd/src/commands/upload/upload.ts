import { info } from '@logger';
import { getUploadCommand } from '.';

import { getCurrentsConfig, setCurrentsConfig } from '../../config/upload';
import { handleCurrentsReport } from '../../services';
import { commandHandler } from '../utils';
import { CLIManager } from './cli-config';

export async function uploadHandler(
  options: ReturnType<ReturnType<typeof getUploadCommand>['opts']>
) {
  await commandHandler(async (opts) => {
    const cliManager = new CLIManager(opts);
    setCurrentsConfig(cliManager.parsedConfig);
    const config = getCurrentsConfig();

    info('Currents config: %o', {
      ...config,
      recordKey: config?.recordKey ? '*****' : undefined,
    });

    await handleCurrentsReport();
  }, options);
}

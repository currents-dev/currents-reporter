import { debug } from '@debug';
import { getConvertCommandConfig } from '../../config/convert';
import { join } from 'path';
import { getReportConfig } from './getReportConfig';
import { ensurePathExists, generateShortHash, writeFileAsync } from '@lib';
import { InstanceReport } from './types';
import { getInstanceMap } from './getInstanceMap';

export async function handleConvert() {
  try {
    const config = getConvertCommandConfig();
    if (!config) {
      throw new Error('Config is missing!');
    }

    const reportDir = config.outputDir;
    await ensurePathExists(reportDir);
    const instancesDir = join(reportDir, 'instances');
    await ensurePathExists(instancesDir);

    const reportConfig = getReportConfig(config);
    debug('Report config:', reportConfig);

    await writeFileAsync(
      join(reportDir, 'config.json'),
      JSON.stringify(reportConfig)
    );

    const instances: Map<string, InstanceReport> = await getInstanceMap(config);

    await Promise.all(
      Array.from(instances.entries()).map(([name, report]) =>
        writeFileAsync(
          join(instancesDir, `${generateShortHash(name)}.json`),
          JSON.stringify(report)
        )
      )
    );

    debug('Conversion completed, reports saved to: %s', reportDir);
  } catch (e) {
    debug('Failed to convert: %o', e);
    throw e;
  }
}

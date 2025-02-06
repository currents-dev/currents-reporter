import { debug } from '@debug';
import {
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsyncIfNotExists,
} from '@lib';
import { info } from '@logger';
import { join } from 'path';
import { getFullTestSuiteFilePath } from '../upload/path';
import { getConvertCommandConfig } from '../../config/convert';
import { InstanceReport } from '../../types';
import { getFullTestSuite } from './getFullTestSuite';
import { getInstanceMap } from './getInstanceMap';
import { getParsedXMLArray } from './getParsedXMLArray';
import { getReportConfig } from './getReportConfig';

export async function handleConvert() {
  try {
    const config = getConvertCommandConfig();
    if (!config) {
      throw new Error('Config is missing!');
    }

    const reportDir = config.outputDir
      ? await createFolder(config.outputDir)
      : await createUniqueFolder(process.cwd(), '.currents');
    const instancesDir = await createFolder(join(reportDir, 'instances'));

    const reportConfig = getReportConfig(config);
    debug('Report config:', reportConfig);

    info('[currents] Convertion files: %s', config.inputFiles.join(', '));

    await writeFileAsyncIfNotExists(
      join(reportDir, 'config.json'),
      JSON.stringify(reportConfig)
    );

    const parsedXMLArray = await getParsedXMLArray(config.inputFiles);

    if (parsedXMLArray.length === 0) {
      throw new Error('No valid XML JUnit report was found.');
    }

    const fullTestSuite = await getFullTestSuite(parsedXMLArray);

    await writeFileAsyncIfNotExists(
      getFullTestSuiteFilePath(reportDir),
      JSON.stringify(fullTestSuite)
    );

    const instances: Map<string, InstanceReport> = await getInstanceMap({
      inputFormat: config.inputFormat,
      framework: config.framework,
      parsedXMLArray,
    });

    await Promise.all(
      Array.from(instances.entries()).map(([name, report]) =>
        writeFileAsyncIfNotExists(
          join(instancesDir, `${generateShortHash(name)}.json`),
          JSON.stringify(report)
        )
      )
    );

    info('[currents] Conversion completed, report saved to: %s', reportDir);
  } catch (e) {
    debug('Failed to convert: %o', e);
    throw e;
  }
}

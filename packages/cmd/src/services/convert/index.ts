import { debug } from '@debug';
import {
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsync,
} from '@lib';
import { info } from '@logger';
import { join } from 'path';
import { getConvertCommandConfig } from '../../config/convert';
import { InstanceReport } from '../../types';
import { getFullTestSuite } from './getFullTestSuite';
import { getInstanceMap } from './getInstanceMap';
import { getParsedXMLInput } from './getParsedXMLInput';
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

    await writeFileAsync(
      join(reportDir, 'config.json'),
      JSON.stringify(reportConfig)
    );

    const parsedXMLInputs = await getParsedXMLInput(
      config.inputFiles,
      reportDir
    );

    if (!parsedXMLInputs) {
      throw new Error('No valid XML JUnit report was found.');
    }

    console.log("PARSED::", JSON.stringify(parsedXMLInputs))

    const fullTestSuite = await getFullTestSuite(parsedXMLInputs);

    await writeFileAsync(
      join(reportDir, 'fullTestSuite.json'),
      JSON.stringify(fullTestSuite)
    );

    const instances: Map<string, InstanceReport> = await getInstanceMap({
      inputFormat: config.inputFormat,
      framework: config.framework,
      parsedXMLInputs,
    });

    await Promise.all(
      Array.from(instances.entries()).map(([name, report]) =>
        writeFileAsync(
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

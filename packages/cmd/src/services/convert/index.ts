import { debug } from '@debug';
import {
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsyncIfNotExists,
} from '@lib';
import { info } from '@logger';
import { join } from 'path';
import { getConvertCommandConfig } from '../../config/convert';
import { Artifact, InstanceReport } from '../../types';
import { getFullTestSuiteFilePath } from '../upload/path';
import { createFullTestSuite } from './createFullTestSuite';
import { getInstanceMap } from './getInstanceMap';
import { getParsedXMLArray } from './getParsedXMLArray';
import { getReportConfig } from './getReportConfig';
import { processArtifacts } from './artifacts';

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

    const fullTestSuite = createFullTestSuite(parsedXMLArray);

    await writeFileAsyncIfNotExists(
      getFullTestSuiteFilePath(reportDir),
      JSON.stringify(fullTestSuite)
    );

    const instances: Map<string, InstanceReport> = await getInstanceMap({
      inputFormat: config.inputFormat,
      framework: config.framework,
      parsedXMLArray,
    });

    const artifactsDir = await createFolder(join(reportDir, 'artifacts'));
    const workspaceRoot = process.cwd();

    await Promise.all(
      Array.from(instances.values()).map(async (report) => {
        // Spec-level artifacts
        await processArtifacts(
          report.artifacts,
          report.spec,
          artifactsDir,
          workspaceRoot
        );

        if (report._stdout) {
          const fileName = `${generateShortHash(report.spec)}.stdout.txt`;
          await writeFileAsyncIfNotExists(
            join(artifactsDir, fileName),
            report._stdout
          );

          if (!report.artifacts) {
            report.artifacts = [];
          }

          report.artifacts.push({
            path: join('artifacts', fileName),
            type: 'stdout',
            contentType: 'text/plain',
            level: 'spec',
          });
          delete report._stdout;
        }

        for (const test of report.results.tests) {
          // Test-level artifacts
          await processArtifacts(
            test.artifacts,
            test.testId,
            artifactsDir,
            workspaceRoot
          );

          for (const attempt of test.attempts) {
            // Attempt-level artifacts
            await processArtifacts(
              attempt.artifacts,
              test.testId + attempt.attempt,
              artifactsDir,
              workspaceRoot
            );
          }
        }
      })
    );

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

import { debug } from '@debug';
import {
  copyFileAsync,
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsyncIfNotExists,
} from '@lib';
import { info } from '@logger';
import { extname, join } from 'path';
import { getConvertCommandConfig } from '../../config/convert';
import { InstanceReport } from '../../types';
import { getFullTestSuiteFilePath } from '../upload/path';
import { createFullTestSuite } from './createFullTestSuite';
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

    await Promise.all(
      Array.from(instances.values()).map(async (report) => {
        // Spec-level artifacts
        if (report.artifacts) {
          for (const artifact of report.artifacts) {
            try {
              const fileName = `${generateShortHash(
                report.spec + artifact.path
              )}.${extname(artifact.path).slice(1) || 'bin'}`;
              await copyFileAsync(artifact.path, join(artifactsDir, fileName));
              // Update path to relative path in artifacts folder
              artifact.path = join('artifacts', fileName);
            } catch (e) {
              debug('Failed to copy spec artifact %s: %o', artifact.path, e);
            }
          }
        }

        for (const test of report.results.tests) {
          // Test-level artifacts
          if (test.artifacts) {
            for (const artifact of test.artifacts) {
              try {
                const fileName = `${generateShortHash(
                  test.testId + artifact.path
                )}.${extname(artifact.path).slice(1) || 'bin'}`;
                await copyFileAsync(
                  artifact.path,
                  join(artifactsDir, fileName)
                );
                // Update path to relative path in artifacts folder
                artifact.path = join('artifacts', fileName);
              } catch (e) {
                debug('Failed to copy test artifact %s: %o', artifact.path, e);
              }
            }
          }

          for (const attempt of test.attempts) {
            // Attempt-level artifacts
            if (attempt.artifacts) {
              for (const artifact of attempt.artifacts) {
                try {
                  const fileName = `${generateShortHash(
                    test.testId + attempt.attempt + artifact.path
                  )}.${extname(artifact.path).slice(1) || 'bin'}`;
                  await copyFileAsync(
                    artifact.path,
                    join(artifactsDir, fileName)
                  );
                  // Update path to relative path in artifacts folder
                  artifact.path = join('artifacts', fileName);
                } catch (e) {
                  debug(
                    'Failed to copy attempt artifact %s: %o',
                    artifact.path,
                    e
                  );
                }
              }
            }
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

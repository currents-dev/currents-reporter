import { debug } from '@debug';
import {
  copyFileAsync,
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsyncIfNotExists,
} from '@lib';
import { info } from '@logger';
import { extname, join, resolve, relative, isAbsolute } from 'path';
import { getConvertCommandConfig } from '../../config/convert';
import { Artifact, InstanceReport } from '../../types';
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
    const workspaceRoot = process.cwd();

    const processArtifacts = async (
      artifacts: Artifact[] | undefined,
      hashKey: string
    ) => {
      if (!artifacts) return;

      for (const artifact of artifacts) {
        try {
          const resolvedPath = resolve(workspaceRoot, artifact.path);
          const relativePath = relative(workspaceRoot, resolvedPath);

          if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
            debug(
              'Skipping artifact outside workspace: %s (resolved: %s)',
              artifact.path,
              resolvedPath
            );
            continue;
          }

          const fileName = `${generateShortHash(
            hashKey + artifact.path
          )}.${extname(artifact.path).slice(1) || 'bin'}`;
          await copyFileAsync(resolvedPath, join(artifactsDir, fileName));
          // Update path to relative path in artifacts folder
          artifact.path = join('artifacts', fileName);
        } catch (e) {
          debug('Failed to copy artifact %s: %o', artifact.path, e);
        }
      }
    };

    await Promise.all(
      Array.from(instances.values()).map(async (report) => {
        // Spec-level artifacts
        await processArtifacts(report.artifacts, report.spec);

        for (const test of report.results.tests) {
          // Test-level artifacts
          await processArtifacts(test.artifacts, test.testId);

          for (const attempt of test.attempts) {
            // Attempt-level artifacts
            await processArtifacts(
              attempt.artifacts,
              test.testId + attempt.attempt
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

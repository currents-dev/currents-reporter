import { debug } from '@debug';
import {
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsyncIfNotExists,
} from '@lib';
import { info } from '@logger';
import fs from 'fs-extra';
import { join, resolve, sep } from 'path';
import {
  REPORT_FRAMEWORKS,
  REPORT_INPUT_FORMATS,
} from '../../commands/convert/options';
import {
  ConvertCommandConfig,
  getConvertCommandConfig,
} from '../../config/convert';
import { Artifact, InstanceReport } from '../../types';
import { getFullTestSuiteFilePath } from '../upload/path';
import {
  createFullTestSuite,
  createFullTestSuiteFromInstances,
} from './createFullTestSuite';
import {
  getInstanceMap as getCypressInstanceMap,
  readCypressResults,
} from './cypress-json';
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

    if (config.outputDir) {
      await assertFolderEmpty(config.outputDir, config.inputFiles);
    }
    const reportDir = config.outputDir
      ? await createFolder(config.outputDir)
      : await createUniqueFolder(process.cwd(), '.currents');
    const instancesDir = await createFolder(join(reportDir, 'instances'));

    const instances =
      config.inputFormat === REPORT_INPUT_FORMATS.cypressJson
        ? await convertCypressResults(config, reportDir)
        : await convertJUnit(config, reportDir);

    // Otherwise the upload fails with "Failed to discover the full test suite!"
    if (instances.size === 0) {
      throw new Error(
        `No test results found in ${config.inputFiles.join(', ')}. Check that the tests ran and that the reports are the files the tests wrote.`
      );
    }

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
    return reportDir;
  } catch (e) {
    debug('Failed to convert: %o', e);
    throw e;
  }
}

// Writes config.json and fullTestSuite.json, and returns the instances
async function convertJUnit(config: ConvertCommandConfig, reportDir: string) {
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

  const instances: Map<string, InstanceReport> = await getInstanceMap({
    inputFormat: config.inputFormat,
    framework: config.framework,
    parsedXMLArray,
  });

  // The Cypress conversion joins the <testsuite> elements of a report into one
  // spec, which the list read from the XML would not match
  const fullTestSuite =
    config.framework === REPORT_FRAMEWORKS.cypress
      ? createFullTestSuiteFromInstances(instances)
      : createFullTestSuite(parsedXMLArray);

  await writeFileAsyncIfNotExists(
    getFullTestSuiteFilePath(reportDir),
    JSON.stringify(fullTestSuite)
  );

  return instances;
}

// Writes config.json and fullTestSuite.json, and returns the instances
async function convertCypressResults(
  config: ConvertCommandConfig,
  reportDir: string
) {
  info('[currents] Convertion files: %s', config.inputFiles.join(', '));

  const results = await readCypressResults(config.inputFiles);

  const reportConfig = getReportConfig({
    ...config,
    frameworkVersion: config.frameworkVersion ?? results[0]?.cypressVersion,
  });
  debug('Report config:', reportConfig);

  await writeFileAsyncIfNotExists(
    join(reportDir, 'config.json'),
    JSON.stringify(reportConfig)
  );

  const instances = getCypressInstanceMap(results);

  await writeFileAsyncIfNotExists(
    getFullTestSuiteFilePath(reportDir),
    JSON.stringify(createFullTestSuiteFromInstances(instances))
  );

  return instances;
}

/**
 * The conversion keeps the files it finds in the folder, and the upload reads
 * every report in it, so reports of an earlier conversion would be uploaded
 * again with the new ones. The JUnit files being converted may sit in the
 * folder, but not where the conversion writes its own files.
 */
async function assertFolderEmpty(folder: string, inputFiles: string[]) {
  const root = resolve(folder);
  const inputs = new Set(inputFiles.map((file) => resolve(file)));
  const generated = [
    join(root, 'config.json'),
    getFullTestSuiteFilePath(root),
    join(root, 'instances'),
    join(root, 'artifacts'),
  ];
  const inGeneratedPath = [...inputs].find((input) =>
    generated.some((path) => input === path || input.startsWith(path + sep))
  );
  if (inGeneratedPath) {
    throw new Error(
      `The report "${inGeneratedPath}" is where the conversion writes its own files. Move the reports out of "${folder}", or leave out --output-dir to convert into a new folder in .currents.`
    );
  }
  const other = (await fs.pathExists(root))
    ? await findOtherFile(root, inputs)
    : undefined;
  if (other) {
    throw new Error(
      `The folder "${folder}" is not empty. Reports already in it would be uploaded with the converted ones. Remove the folder, or leave out --output-dir to convert into a new folder in .currents.`
    );
  }
}

/** The first file under the folder that is not one of the inputs. */
async function findOtherFile(
  folder: string,
  inputs: Set<string>
): Promise<string | undefined> {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    const other = entry.isDirectory()
      ? await findOtherFile(path, inputs)
      : inputs.has(path)
        ? undefined
        : path;
    if (other) return other;
  }
  return undefined;
}

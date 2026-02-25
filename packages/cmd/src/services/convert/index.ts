import { debug } from '@debug';
import {
  copyFileAsync,
  createFolder,
  createUniqueFolder,
  generateShortHash,
  writeFileAsyncIfNotExists,
} from '@lib';
import { info } from '@logger';
import { join, extname } from 'path';
import { getFullTestSuiteFilePath } from '../upload/path';
import { getConvertCommandConfig } from '../../config/convert';
import { Artifact, InstanceReport } from '../../types';
import { createFullTestSuite } from './createFullTestSuite';
import { getInstanceMap } from './getInstanceMap';
import { getParsedXMLArray } from './getParsedXMLArray';
import { getReportConfig } from './getReportConfig';

function extractAttachmentsFromLog(
  log: string
): { sourcePath: string; ext: string }[] {
  const out: { sourcePath: string; ext: string }[] = [];
  const matches = log.matchAll(/\[\[ATTACHMENT\|([^\]]+)\]\]/g);
  for (const match of matches) {
    const sourcePath = match[1];
    const ext = extname(sourcePath).slice(1).toLowerCase();
    out.push({ sourcePath, ext });
  }
  return out;
}

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
        for (const test of report.results.tests) {
          for (const attempt of test.attempts) {
            const artifacts: Artifact[] = [];

            const combinedLogs: string[] = [];

            if (attempt.stdout && attempt.stdout.length > 0) {
              combinedLogs.push(...attempt.stdout);
            }

            if (attempt.stderr && attempt.stderr.length > 0) {
              combinedLogs.push(
                ...attempt.stderr.map((l) => `[stderr] ${l}`)
              );
            }

            if (combinedLogs.length > 0) {
              const fileName = `${generateShortHash(
                test.testId + attempt.attempt + 'stdout'
              )}.txt`;
              await writeFileAsyncIfNotExists(
                join(artifactsDir, fileName),
                combinedLogs.join('\n')
              );
              artifacts.push({
                path: join('artifacts', fileName),
                type: 'stdout',
                contentType: 'text/plain',
              });
            }

            const logsForAttachments = [
              ...(attempt.stdout ?? []),
              ...(attempt.stderr ?? []),
            ];

            for (const log of logsForAttachments) {
              const attachments = extractAttachmentsFromLog(log);
              for (const { sourcePath, ext } of attachments) {

                let type: Artifact['type'] = 'attachment';
                let contentType = 'application/octet-stream';

                if (ext === 'mp4' || ext === 'webm') {
                  type = 'video';
                  contentType = ext === 'mp4' ? 'video/mp4' : 'video/webm';
                } else if (
                  ext === 'png' ||
                  ext === 'jpg' ||
                  ext === 'jpeg' ||
                  ext === 'bmp'
                ) {
                  type = 'screenshot';
                  contentType =
                    ext === 'png'
                      ? 'image/png'
                      : ext === 'bmp'
                      ? 'image/bmp'
                      : 'image/jpeg';
                }

                const artifactExt = ext || 'bin';
                const fileName = `${generateShortHash(
                  test.testId + attempt.attempt + sourcePath
                )}.${artifactExt}`;

                try {
                  await copyFileAsync(
                    sourcePath,
                    join(artifactsDir, fileName)
                  );
                  artifacts.push({
                    path: join('artifacts', fileName),
                    type,
                    contentType,
                  });
                } catch (e) {
                  debug(
                    'Failed to copy attachment artifact %s: %o',
                    sourcePath,
                    e
                  );
                }
              }
            }

            if (artifacts.length > 0) {
              attempt.artifacts = artifacts;
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

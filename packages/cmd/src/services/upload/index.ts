import { debug, setTraceFilePath } from '@debug';
import { getCI } from '@env/ciProvider';
import { getGitInfo } from '@env/gitInfo';
import { getPlatformInfo } from '@env/platform';
import { reporterVersion } from '@env/versions';
import { maskRecordKey, nanoid, readJsonFile, writeFileAsync } from '@lib';
import { info, warn } from '@logger';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import {
  ArtifactUploadInstruction,
  Framework,
  RunCreationConfig,
  createRun as createRunApi,
  uploadStdout as uploadStdoutApi,
} from '../../api';
import { getCurrentsConfig } from '../../config/upload';
import { InstanceReport } from '../../types';
import { FullTestSuite, createScanner } from './discovery';
import {
  checkPathExists,
  getInstanceReportList,
  resolveReportOptions,
} from './fs';
import { getFullTestSuiteFilePath } from './path';
import { ReportConfig, UploadMarkerInfo } from './types';
import { splitArrayIntoChunks } from './utils';

export async function handleCurrentsReport() {
  const currentsConfig = getCurrentsConfig();
  if (!currentsConfig) {
    throw new Error('Currents config is missing!');
  }

  const reportOptions = await resolveReportOptions(currentsConfig);
  // set the trace file path
  setTraceFilePath(getTraceFilePath(reportOptions.reportDir));

  debug('Reporter options: %o', reportOptions);

  info('Report directory: %s', reportOptions.reportDir);

  const config = await readJsonFile<ReportConfig>(reportOptions.configFilePath);
  debug('Report config: %o', config);

  const instanceReportList = await getInstanceReportList(
    reportOptions.reportDir
  );
  debug(
    'Found %d instance results in the reportDir: %s',
    instanceReportList.length,
    reportOptions.reportDir
  );

  const markerFilePath = getMarkerFilePath(reportOptions.reportDir);
  const markerFileExists = await checkPathExists(markerFilePath);

  const fullTestSuiteFilePath = getFullTestSuiteFilePath(
    reportOptions.reportDir
  );

  let fullTestSuite: FullTestSuite | null = null;
  if (markerFileExists) {
    const markerInfo = await readJsonFile<UploadMarkerInfo>(markerFilePath);
    warn('Marker file detected. The report was already uploaded: %o', {
      runUrl: markerInfo.response.runUrl,
      isoDate: markerInfo.isoDate,
    });
  }

  const fullTestSuiteFileExists = await checkPathExists(fullTestSuiteFilePath);
  if (fullTestSuiteFileExists) {
    fullTestSuite = await readJsonFile<FullTestSuite>(fullTestSuiteFilePath);
    debug('Full test suite file detected: %s', fullTestSuiteFilePath);
  }

  if (!fullTestSuite) {
    const scanner = createScanner(config, reportOptions.reportDir);
    fullTestSuite = await scanner.getFullTestSuite();

    if (isEmptyTestSuite(fullTestSuite)) {
      throw new Error('Failed to discover the full test suite!');
    }

    await writeFileAsync(fullTestSuiteFilePath, JSON.stringify(fullTestSuite));
  } else {
    debug('The discovery stage was skipped');
  }

  const defaultGroup =
    fullTestSuite.length === 1 ? fullTestSuite[0].name : null;

  const runCreationConfig: RunCreationConfig = {
    currents: currentsConfig,
  };

  const framework: Framework = {
    type: config.framework,
    version: config.frameworkVersion,
    clientVersion: reporterVersion,
    frameworkConfig: {
      originFramework: config.frameworkConfig?.originFramework as
        | string
        | undefined,
      originFrameworkVersion: config.frameworkConfig?.originFrameworkVersion as
        | string
        | undefined,
    },
  };

  const machineId = nanoid.userFacingNanoid();
  const ci = getCI(currentsConfig.ciBuildId);

  const instancesByGroup: Record<string, InstanceReport[]> = {};
  for await (const instanceReport of instanceReportList) {
    const report = await readJsonFile<InstanceReport>(instanceReport);
    if (!instancesByGroup[report.groupId]) {
      instancesByGroup[report.groupId] = [];
    }
    instancesByGroup[report.groupId].push(report);
  }

  for await (const key of Object.keys(instancesByGroup)) {
    let instances = instancesByGroup[key];
    let group = key;

    if (defaultGroup) {
      debug(
        'Default group found: %s, overwriting the group in the results',
        defaultGroup
      );

      group = defaultGroup;
      instances = instances.map((i) => ({
        ...i,
        groupId: defaultGroup,
      }));
    }

    try {
      // Divide the instance objects in chunks if the array exceeds 10MB
      const chunks = splitArrayIntoChunks<InstanceReport>(instances);

      // Call the /v1/runs endpoint with the fullTestSuite only, to create the run
      const response = await createRun({
        ci,
        group,
        instances: [],
        fullTestSuite,
        config: runCreationConfig,
        machineId,
        framework,
      });

      if (
        !response.artifactUploadUrls ||
        response.artifactUploadUrls.length === 0
      ) {
        info('No artifacts to handle: initial run created without instances');
      }

      // Iterates over the instance chunks and sends the instances without the fullTestSuite
      for (let i = 0; i < chunks.length; i++) {
        const chunkResponse = await createRun({
          ci,
          group,
          instances: chunks[i],
          fullTestSuite: [],
          config: runCreationConfig,
          machineId,
          framework,
        });

        // Upload stdout for each instance in the chunk
        await Promise.all(
          chunks[i].map(async (instance) => {
            await handleInstanceStdout(
              instance,
              chunkResponse.runId,
              runCreationConfig
            );
          })
        );

        if (
          chunkResponse.artifactUploadUrls &&
          chunkResponse.artifactUploadUrls.length > 0
        ) {
          await uploadArtifacts(
            chunkResponse.artifactUploadUrls,
            reportOptions.reportDir,
            chunks[i]
          );
        }
      }

      debug('Api response: %o', response);

      info('[%s] Run created: %s', group, response.runUrl);

      const markerInfo = {
        response,
        isoDate: new Date().toISOString(),
      };

      await writeFileAsync(markerFilePath, JSON.stringify(markerInfo));

      debug(
        'Marker file %s: %s',
        markerFileExists ? 'overwritten' : 'created',
        markerFilePath
      );
    } catch (e) {
      debug('Failed to upload the results to the dashboard');
      throw e;
    }
  }
}

async function createRun({
  ci,
  group,
  instances,
  fullTestSuite,
  config,
  machineId,
  framework,
}: {
  ci: ReturnType<typeof getCI>;
  group: string;
  instances: InstanceReport[];
  fullTestSuite?: FullTestSuite;
  config: RunCreationConfig;
  machineId: string;
  framework: Framework;
}) {
  const commit = await getGitInfo();
  const platformInfo = await getPlatformInfo();
  const browserInfo = {
    browserName: 'node',
    browserVersion: semver.coerce(process.version)?.version,
  };

  const { currents } = config;

  const platform = { ...browserInfo, ...platformInfo };
  const payload = {
    platform,
    ci,
    commit,
    group,
    fullTestSuite,
    config,
    projectId: currents.projectId,
    recordKey: currents.recordKey,
    ciBuildId: ci.ciBuildId.value ?? undefined,
    tags: currents.tag ?? [],
    machineId: currents.machineId ?? machineId,
    framework,
    instances,
    previousCiBuildId: process.env.CURRENTS_PREVIOUS_CI_BUILD_ID,
  };

  debug('Creating run: %o', maskRecordKey(payload));

  return createRunApi(payload);
}

async function handleInstanceStdout(
  instance: InstanceReport,
  runId: string,
  config: RunCreationConfig
) {
  try {
    const { default: XXH } = await import('xxhashjs');
    const combined = runId + instance.groupId + instance.spec;
    const instanceId = XXH.h64(combined, 0).toString(16).padStart(16, '0');

    // Aggregate stdout from all attempts
    // We also include stderr as the user requested aggregation of both
    // Contract: "Aggregate on the client (e.g. concatenate all attempt stdout and stderr for that instance into one string)."
    const logs = extractLogs(instance);

    if (logs.length === 0) {
      return;
    }

    const aggregatedStdout = logs.join('\n');
    await uploadStdoutApi(instanceId, aggregatedStdout, config);
    debug(
      'Uploaded aggregated stdout for instance %s (id: %s)',
      instance.spec,
      instanceId
    );
  } catch (e) {
    warn(
      'Failed to upload aggregated stdout for instance %s: %o',
      instance.spec,
      e
    );
  }
}

export function extractLogs(instance: InstanceReport): string[] {
  return instance.results.tests.flatMap((test) =>
    test.attempts.flatMap((attempt) => {
      const stdout = attempt.stdout || [];
      const stderr = (attempt.stderr || []).map((l) => `[stderr] ${l}`);
      return [...stdout, ...stderr];
    })
  );
}

function getMarkerFilePath(reportDir: string) {
  return path.join(reportDir, 'upload.marker.json');
}

function getTraceFilePath(reportDir: string) {
  return path.join(reportDir, `.debug-${new Date().toISOString()}.log`);
}

function isEmptyTestSuite(testSuite: FullTestSuite) {
  return (
    testSuite.length === 0 ||
    testSuite.some((project) => project.tests.length === 0)
  );
}

async function uploadArtifacts(
  instructions: ArtifactUploadInstruction[],
  reportDir: string,
  instances: InstanceReport[]
) {
  const contentTypeMap = new Map<string, string>();

  const allArtifacts = instances.flatMap((instance) => {
    const instanceArtifacts = instance.artifacts || [];
    const testArtifacts = instance.results.tests.flatMap((test) => {
      const tArtifacts = test.artifacts || [];
      const attemptArtifacts = test.attempts.flatMap(
        (attempt) => attempt.artifacts || []
      );
      return [...tArtifacts, ...attemptArtifacts];
    });
    return [...instanceArtifacts, ...testArtifacts];
  });

  allArtifacts.forEach((artifact) => {
    if (artifact) {
      contentTypeMap.set(artifact.path, artifact.contentType);
    }
  });

  debug('Uploading %d artifacts', instructions.length);

  await Promise.all(
    instructions.map((instruction) =>
      handleInstruction(instruction, reportDir, contentTypeMap)
    )
  );
}

const handleInstruction = async (
  instruction: ArtifactUploadInstruction,
  reportDir: string,
  contentTypeMap: Map<string, string>
) => {
  try {
    const filePath = path.join(reportDir, instruction.path);
    if (!(await fs.pathExists(filePath))) {
      warn('Artifact file not found: %s', filePath);
      return;
    }

    const fileBuffer = await fs.readFile(filePath);
    const contentType =
      contentTypeMap.get(instruction.path) || 'application/octet-stream';

    await axios.put(instruction.uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (err) {
    debug('Failed to upload artifact %s: %o', instruction.path, err);
  }
};

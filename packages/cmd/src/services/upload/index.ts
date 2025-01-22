import { debug, setTraceFilePath } from '@debug';
import { getCI } from '@env/ciProvider';
import { getGitInfo } from '@env/gitInfo';
import { getPlatformInfo } from '@env/platform';
import { reporterVersion } from '@env/versions';
import { maskRecordKey, nanoid, readJsonFile, writeFileAsync } from '@lib';
import { info, warn } from '@logger';
import path from 'path';
import semver from 'semver';
import {
  Framework,
  RunCreationConfig,
  createRun as createRunApi,
} from '../../api';
import { getCurrentsConfig } from '../../config/upload';
import { InstanceReport } from '../../types';
import { FullTestSuite, createScanner } from './discovery';
import {
  checkPathExists,
  getInstanceReportList,
  resolveReportOptions,
} from './fs';
import { ReportConfig, UploadMarkerInfo } from './types';

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

    const fullTestSuiteFileExists = await checkPathExists(
      fullTestSuiteFilePath
    );

    if (fullTestSuiteFileExists) {
      fullTestSuite = await readJsonFile<FullTestSuite>(fullTestSuiteFilePath);
      debug('Full test suite file detected: %s', fullTestSuiteFilePath);
    }
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
      const response = await createRun({
        ci,
        group,
        instances,
        fullTestSuite,
        config: runCreationConfig,
        machineId,
        framework,
      });

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
  fullTestSuite: FullTestSuite;
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

function getMarkerFilePath(reportDir: string) {
  return path.join(reportDir, 'upload.marker.json');
}

export function getFullTestSuiteFilePath(reportDir: string) {
  return path.join(reportDir, 'fullTestSuite.json');
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

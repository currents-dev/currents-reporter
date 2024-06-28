import { mapValues } from "lodash";
import path from "path";
import semver from "semver";
import { Framework, RunCreationConfig, createRun as createRunApi } from "./api";
import { getCurrentsConfig } from "./config";
import { debug as _debug, captureDebugToFile } from "./debug";
import { FullTestSuite, createScanner } from "./discovery";
import { getCI } from "./env/ciProvider";
import { getGitInfo } from "./env/gitInfo";
import { getPlatformInfo } from "./env/platform";
import { reporterVersion } from "./env/versions";
import {
  checkPathExists,
  getInstanceReportList,
  nanoid,
  readJsonFile,
  resolveReportOptions,
  writeFileAsync,
} from "./lib";
import { info, warn } from "./logger";
import { InstanceReport, ReportConfig, UploadMarkerInfo } from "./types";

export async function currentsReporter() {
  const currentsConfig = getCurrentsConfig();
  if (!currentsConfig) {
    throw new Error("Currents config is missing!");
  }

  const reportOptions = await resolveReportOptions(currentsConfig);
  const debug = captureDebugToFile(
    getTraceFilePath(reportOptions.reportDir),
    _debug.namespace,
    _debug.enabled
  );

  debug("Reporter options: %o", reportOptions);

  info("Report directory: %s", reportOptions.reportDir);

  const config = await readJsonFile<ReportConfig>(reportOptions.configFilePath);
  debug("Report config: %o", config);

  const instanceReportList = await getInstanceReportList(
    reportOptions.reportDir
  );
  debug(
    "Found %d instance results in the reportDir: %s",
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
    warn("Marker file detected. The report was already uploaded: %o", {
      runUrl: markerInfo.response.runUrl,
      isoDate: markerInfo.isoDate,
    });

    fullTestSuite = await readJsonFile<FullTestSuite>(fullTestSuiteFilePath);
    debug("Full test suite file detected: %s", fullTestSuiteFilePath);
  }

  if (!fullTestSuite) {
    const scanner = createScanner(config);
    fullTestSuite = await scanner.getFullTestSuite();

    if (fullTestSuite.length === 0) {
      throw new Error("Failed to discover the full test suite!");
    }

    await writeFileAsync(fullTestSuiteFilePath, JSON.stringify(fullTestSuite));
  } else {
    debug("The discovery stage was skipped");
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
  };

  const machineId = nanoid.userFacingNanoid();

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
        "Default group found: %s, overwriting the group in the results",
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
        group,
        instances,
        fullTestSuite,
        config: runCreationConfig,
        machineId,
        framework,
      });

      debug("Api response: %o", response);

      info("Run created: %s", response.runUrl);

      const markerInfo = {
        response,
        isoDate: new Date().toISOString(),
      };

      await writeFileAsync(markerFilePath, JSON.stringify(markerInfo));

      debug(
        "Marker file %s: %s",
        markerFileExists ? "overwritten" : "created",
        markerFilePath
      );
    } catch (_) {
      throw new Error("Failed to upload the results to the dashboard");
    }
  }
}

async function createRun({
  group,
  instances,
  fullTestSuite,
  config,
  machineId,
  framework,
}: {
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
    browserName: "node",
    browserVersion: semver.coerce(process.version)?.version,
  };

  const { currents } = config;

  const platform = { ...browserInfo, ...platformInfo };
  const ci = getCI(currents.ciBuildId);
  const payload = {
    platform,
    ci,
    commit,
    group,
    fullTestSuite,
    config,
    projectId: currents.projectId,
    recordKey: currents.recordKey,
    ciBuildId: currents.ciBuildId,
    tags: currents.tag ?? [],
    machineId: currents.machineId ?? machineId,
    framework,
    instances,
  };

  _debug(
    "Creating run: %o",
    mapValues(payload, (v, k) => (k === "recordKey" ? "******" : v))
  );

  return createRunApi(payload);
}

function getMarkerFilePath(reportDir: string) {
  return path.join(reportDir, "upload.marker.json");
}

function getFullTestSuiteFilePath(reportDir: string) {
  return path.join(reportDir, "fullTestSuite.json");
}

function getTraceFilePath(reportDir: string) {
  return path.join(reportDir, `.debug-${new Date().toISOString()}.log`);
}

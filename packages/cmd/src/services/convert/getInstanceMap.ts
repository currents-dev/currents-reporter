import { ConvertCommandConfig } from 'config/convert';
import { InstanceReport } from './types';
import {
  combineResults,
  readInputFile,
  saveCombinedResultsFile,
} from './combineInputFiles';
import { getPostmanInstances } from './getInstances';

export async function getInstanceMap(
  config: ConvertCommandConfig
): Promise<Map<string, InstanceReport>> {
  let combinedResult: string = '';
  if (config.inputFiles.length > 1) {
    combinedResult = await combineResults(config.inputFiles);
  } else {
    combinedResult = readInputFile(config.inputFiles[0]);
  }
  if (combinedResult.trim()) {
    saveCombinedResultsFile(combinedResult, config.outputDir);
    switch (config.framework) {
      case 'postman':
      default:
        return Promise.resolve(getPostmanInstances(combinedResult));
    }
  }
  return new Map();
}

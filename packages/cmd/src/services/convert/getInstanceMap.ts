import { ConvertCommandConfig } from 'config/convert';
import { InstanceReport } from './types';
import { combineResults, saveCombinedResultsFile } from './combineInputFiles';
import { getPostmanInstances } from './getInstances';

export async function getInstanceMap(
  config: ConvertCommandConfig
): Promise<Map<string, InstanceReport>> {
  let combinedResult: string = '';
  combinedResult = await combineResults(config.inputFiles);
  saveCombinedResultsFile(combinedResult, config.outputDir);
  switch (config.framework) {
    case 'postman':
    default:
      return Promise.resolve(getPostmanInstances(combinedResult));
  }
}

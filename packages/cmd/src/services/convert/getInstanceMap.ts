import { ConvertCommandConfig } from 'config/convert';
import { InstanceReport } from './types';
import combineResults from './combineInputFiles';
import { getInstances } from './getInstances';

export async function getInstanceMap(
  config: ConvertCommandConfig
): Promise<Map<string, InstanceReport>> {
  const inputFiles = config.inputFile.split(',');
  let combinedResult: string = '';
  if (inputFiles.length) {
    combinedResult = await combineResults(inputFiles);
  }
  return Promise.resolve(getInstances(combinedResult, config));
}

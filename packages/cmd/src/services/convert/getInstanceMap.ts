import { warn } from '@logger';
import { ConvertCommandConfig } from 'config/convert';
import { readFile } from 'fs-extra';
import { combineInputFiles, saveXMLInput } from './combineInputFiles';
import { getInstanceMapForPostman } from './getInstances';
import { InstanceReport } from './types';

export async function getInstanceMap(
  config: ConvertCommandConfig
): Promise<Map<string, InstanceReport>> {
  if (config.inputFormat === 'junit') {
    const xmlInput =
      config.inputFiles.length > 1
        ? await combineInputFiles(config.inputFiles)
        : await readFile(config.inputFiles[0], 'utf-8'); // inputFiles has at least one element

    const trimmedXMLInput = xmlInput.trim();
    if (trimmedXMLInput) {
      await saveXMLInput(config.outputDir, trimmedXMLInput);
      return getInstanceMapByFramework(config.framework, trimmedXMLInput);
    }
  }

  return new Map();
}

async function getInstanceMapByFramework(framework: string, xmlInput: string) {
  switch (framework) {
    case 'postman':
      return getInstanceMapForPostman(xmlInput);
    default:
      warn('Unsupported framework: %s', framework);
      return new Map<string, InstanceReport>();
  }
}

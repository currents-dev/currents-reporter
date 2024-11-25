import { warn } from '@logger';
import { readFile } from 'fs-extra';
import {
  REPORT_FRAMEWORKS,
  REPORT_INPUT_FORMATS,
} from '../../commands/convert/options';
import { InstanceReport } from '../../types';
import { combineInputFiles, saveXMLInput } from './combineInputFiles';
import { getInstanceMap as getInstanceMapForPostman } from './postman/instances';

export async function getInstanceMap({
  inputFormat,
  inputFiles,
  outputDir,
  framework,
}: {
  inputFormat: REPORT_INPUT_FORMATS;
  inputFiles: string[];
  outputDir: string;
  framework: REPORT_FRAMEWORKS;
}): Promise<Map<string, InstanceReport>> {
  if (inputFormat === REPORT_INPUT_FORMATS.junit) {
    let xmlInput = '';
    if (inputFiles.length > 1) {
      xmlInput = await combineInputFiles(inputFiles);
    } else if (inputFiles.length === 1) {
      xmlInput = await readFile(inputFiles[0], 'utf-8');
    }

    const trimmedXMLInput = xmlInput.trim();
    if (trimmedXMLInput) {
      await saveXMLInput(outputDir, trimmedXMLInput);
      return getInstanceMapByFramework(framework, trimmedXMLInput);
    }
  }

  return new Map();
}

async function getInstanceMapByFramework(
  framework: REPORT_FRAMEWORKS,
  xmlInput: string
) {
  switch (framework) {
    case 'postman':
      return getInstanceMapForPostman(xmlInput);
    default:
      warn('Unsupported framework: %s', framework);
      return new Map<string, InstanceReport>();
  }
}

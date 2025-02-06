import { warn } from '@logger';
import {
  REPORT_FRAMEWORKS,
  REPORT_INPUT_FORMATS,
} from '../../commands/convert/options';
import { InstanceReport } from '../../types';
import { getInstanceMap as getInstanceMapForPostman } from './postman/instances';
import { TestSuites } from './types';

export async function getInstanceMap({
  inputFormat,
  framework,
  parsedXMLArray,
}: {
  inputFormat: REPORT_INPUT_FORMATS;
  framework: REPORT_FRAMEWORKS;
  parsedXMLArray: TestSuites[];
}): Promise<Map<string, InstanceReport>> {
  if (inputFormat === REPORT_INPUT_FORMATS.junit) {
    return getInstanceMapByFramework(framework, parsedXMLArray);
  }

  return new Map();
}

async function getInstanceMapByFramework(
  framework: REPORT_FRAMEWORKS,
  parsedXMLArray: TestSuites[]
) {
  switch (framework) {
    case 'postman':
      return getInstanceMapForPostman(parsedXMLArray);
    case 'vitest':
      return getInstanceMapForPostman(parsedXMLArray);
    default:
      warn('Unsupported framework: %s', framework);
      return new Map<string, InstanceReport>();
  }
}

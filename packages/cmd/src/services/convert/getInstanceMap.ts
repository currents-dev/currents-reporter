import { warn } from '@logger';
import {
  REPORT_FRAMEWORKS,
  REPORT_INPUT_FORMATS,
} from '../../commands/convert/options';
import { InstanceReport } from '../../types';
import { getInstanceMap as getInstanceMapForPostman } from './postman/instances';

export async function getInstanceMap({
  inputFormat,
  framework,
  parsedXMLInput,
}: {
  inputFormat: REPORT_INPUT_FORMATS;
  framework: REPORT_FRAMEWORKS;
  parsedXMLInput: any;
}): Promise<Map<string, InstanceReport>> {
  if (inputFormat === REPORT_INPUT_FORMATS.junit) {
    return getInstanceMapByFramework(framework, parsedXMLInput);
  }

  return new Map();
}

async function getInstanceMapByFramework(
  framework: REPORT_FRAMEWORKS,
  parsedXMLInput: any
) {
  switch (framework) {
    case 'postman':
      return getInstanceMapForPostman(parsedXMLInput);
    case 'vitest':
      return getInstanceMapForPostman(parsedXMLInput);
    default:
      warn('Unsupported framework: %s', framework);
      return new Map<string, InstanceReport>();
  }
}

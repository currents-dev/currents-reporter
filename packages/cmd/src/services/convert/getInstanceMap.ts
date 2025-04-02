import { warn } from '@logger';
import {
  REPORT_FRAMEWORKS,
  REPORT_INPUT_FORMATS,
} from '../../commands/convert/options';
import { InstanceReport } from '../../types';
import { getInstanceMap as getInstanceMapForNode } from './node/instances';
import { getInstanceMap as getInstanceMapForPostman } from './postman/instances';
import { TestSuites } from './types';
import { getInstanceMap as getInstanceMapForVitest } from './vitest/instances';
import { getInstanceMap as getInstanceMapForWdio } from './wdio/instances';

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
    case REPORT_FRAMEWORKS.node:
      return getInstanceMapForNode(parsedXMLArray);
    case REPORT_FRAMEWORKS.postman:
      return getInstanceMapForPostman(parsedXMLArray);
    case REPORT_FRAMEWORKS.vitest:
      return getInstanceMapForVitest(parsedXMLArray);
    case REPORT_FRAMEWORKS.wdio:
      return getInstanceMapForWdio(parsedXMLArray);
    default:
      warn('Unsupported framework: %s', framework);
      return new Map<string, InstanceReport>();
  }
}

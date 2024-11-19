import { ConvertCommandConfig } from 'config/convert';
import { InstanceReport } from './types';

export function getInstanceMap(
  config: ConvertCommandConfig
): Promise<Map<string, InstanceReport>> {
  return Promise.resolve(new Map());
}

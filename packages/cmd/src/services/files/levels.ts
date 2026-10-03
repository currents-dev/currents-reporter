import { FileType } from './types';

export type FileLevel = 'run' | 'instance' | 'test' | 'attempt';

export type FilesTarget = {
  instanceId?: string;
  testId?: string;
  attempt?: number;
  spec?: string;
  testTitle?: string;
};

/** The types the API takes at each level of a run. */
export const ALLOWED_TYPES: Record<FileLevel, readonly FileType[]> = {
  run: ['attachment'],
  instance: ['attachment', 'video', 'screenshot'],
  test: ['attachment'],
  attempt: ['attachment', 'video', 'screenshot', 'trace'],
};

/** A session takes every type, flat: it has no instance or test. */
export const SESSION_ALLOWED_TYPES: readonly FileType[] = [
  'attachment',
  'video',
  'screenshot',
  'trace',
];

/** Where the API puts the attachments for a target on a CI run. */
export function getFileLevel(target: FilesTarget): FileLevel {
  if (target.testId || target.testTitle) {
    return target.attempt === undefined ? 'test' : 'attempt';
  }
  if (target.instanceId || target.spec) return 'instance';
  return 'run';
}

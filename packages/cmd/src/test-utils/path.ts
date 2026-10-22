import path from 'path';

/** Joins with / on every platform, the way glob patterns and matches are written. */
export const posixJoin = (...parts: string[]) =>
  path.join(...parts).replace(/\\/g, '/');

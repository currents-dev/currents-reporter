import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packTraceFolder } from '../packTrace';

describe('packTraceFolder', () => {
  let dir: string;
  let tempRoot: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-trace-test-'));
    // A temp folder of its own, so other test files can't add to it
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-trace-tmp-'));
    vi.stubEnv('TMPDIR', tempRoot);
    vi.stubEnv('TMP', tempRoot);
    vi.stubEnv('TEMP', tempRoot);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('writes the zip to a temp folder that cleanup removes', async () => {
    fs.writeFileSync(path.join(dir, 'trace-1.trace'), '{}');
    fs.mkdirSync(path.join(dir, 'resources'));
    fs.writeFileSync(path.join(dir, 'resources', 'r1'), 'x');

    const { zipPath, cleanup } = await packTraceFolder(dir);
    expect(path.dirname(path.dirname(zipPath))).toBe(tempRoot);
    expect(fs.statSync(zipPath).size).toBeGreaterThan(0);

    await cleanup();
    expect(fs.readdirSync(tempRoot)).toEqual([]);
    await expect(cleanup()).resolves.toBeUndefined();
  });

  it('removes the temp folder when packing fails', async () => {
    await expect(packTraceFolder(path.join(dir, 'missing'))).rejects.toThrow();
    expect(fs.readdirSync(tempRoot)).toEqual([]);
  });
});

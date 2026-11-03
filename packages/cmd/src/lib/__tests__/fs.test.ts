import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempFile } from '../fs';

describe('createTempFile', () => {
  const created: string[] = [];
  afterEach(() => {
    created.splice(0).forEach((file) => fs.rmSync(file, { force: true }));
  });

  it('creates an empty file in the OS temp folder with the suffix', async () => {
    const file = await createTempFile('.json');
    created.push(file);
    expect(path.dirname(file)).toBe(os.tmpdir());
    expect(file).toMatch(/\.json$/);
    expect(fs.readFileSync(file, 'utf8')).toBe('');
  });

  it.skipIf(process.platform === 'win32')(
    'lets only the owner read and write the file',
    async () => {
      const file = await createTempFile();
      created.push(file);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
  );

  it('gives each call a new file', async () => {
    const files = await Promise.all([createTempFile(), createTempFile()]);
    created.push(...files);
    expect(files[0]).not.toBe(files[1]);
  });
});

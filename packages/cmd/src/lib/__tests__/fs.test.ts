import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempFile, pathExists, readJson } from '../fs';

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

describe('readJson', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-json-test-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a file with a byte order mark', async () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, '\uFEFF{"a":1}');
    expect(await readJson(file)).toEqual({ a: 1 });
  });

  it('starts a parse error with the file path', async () => {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{');
    await expect(readJson(file)).rejects.toThrow(
      expect.objectContaining({
        name: 'SyntaxError',
        message: expect.stringMatching(new RegExp(`^${file}: `)),
      })
    );
  });

  it('fails with ENOENT for a missing file', async () => {
    await expect(readJson(path.join(dir, 'none.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('pathExists', () => {
  it('is true for a file or folder and false otherwise', async () => {
    expect(await pathExists(os.tmpdir())).toBe(true);
    expect(await pathExists(path.join(os.tmpdir(), randomUUID()))).toBe(false);
  });
});

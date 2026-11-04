import fs from 'fs';
import os from 'os';
import path from 'path';
import { createFolder, readInstanceReport } from '../fs';
import { removeFullTestSuite } from '../fullTestSuite';

describe('report files', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-fs-test-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a previous report, also with a byte order mark', async () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, '﻿{"a":1}');
    expect(await readInstanceReport(file)).toEqual({ a: 1 });
  });

  it('has no previous report when the file is missing or not JSON', async () => {
    expect(await readInstanceReport(path.join(dir, 'none.json'))).toBe(
      undefined
    );
    fs.writeFileSync(path.join(dir, 'bad.json'), '{');
    expect(await readInstanceReport(path.join(dir, 'bad.json'))).toBe(
      undefined
    );
  });

  it('creates nested folders, also when they exist', async () => {
    const folder = path.join(dir, 'a', 'b');
    await createFolder(folder);
    await createFolder(folder);
    expect(fs.statSync(folder).isDirectory()).toBe(true);
  });

  it('removes the full test suite file, also when it is missing', async () => {
    fs.writeFileSync(path.join(dir, 'fullTestSuite.json'), '[]');
    await removeFullTestSuite(dir);
    expect(fs.existsSync(path.join(dir, 'fullTestSuite.json'))).toBe(false);
    await expect(removeFullTestSuite(dir)).resolves.toBeUndefined();
  });
});

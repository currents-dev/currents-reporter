import fs from 'fs-extra';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listZipEntries } from '../../../lib/zip';
import { unzipBuffer, zipFilesToBuffer } from '../fs';

describe('zipFilesToBuffer', () => {
  const testDir = path.join(__dirname, 'test-files');

  const file1Path = path.join(testDir, 'file1.txt');
  const file2Path = path.join(testDir, 'file2.txt');
  const subdirPath = path.join(testDir, 'subdir');
  const file3Path = path.join(subdirPath, 'file3.txt');

  beforeAll(async () => {
    await fs.ensureDir(testDir);
    await fs.writeFile(file1Path, '');
    await fs.writeFile(file2Path, '');
    await fs.ensureDir(subdirPath);
    await fs.writeFile(file3Path, '');
  });

  afterAll(async () => {
    await fs.remove(testDir);
  });

  it('should zip a single file', async () => {
    const buffer = await zipFilesToBuffer([file1Path]);
    const entries = await listZipEntries(buffer);
    expect(entries.length).toBe(1);
  });

  it('should zip multiple files', async () => {
    const buffer = await zipFilesToBuffer([file1Path, file2Path]);
    const entries = await listZipEntries(buffer);
    expect(entries.length).toBe(2);
  });

  it('should zip a directory', async () => {
    const buffer = await zipFilesToBuffer([testDir]);
    const entryNames = await listZipEntries(buffer);

    expect(entryNames).toContain(path.relative(process.cwd(), file1Path));
    expect(entryNames).toContain(path.relative(process.cwd(), file2Path));
    expect(entryNames).toContain(path.relative(process.cwd(), file3Path));
    expect(entryNames).toContain(
      path.relative(process.cwd(), subdirPath) + '/'
    );
  });

  it('should zip mixed files and directories', async () => {
    const buffer = await zipFilesToBuffer([file1Path, subdirPath]);
    const entryNames = await listZipEntries(buffer);

    expect(entryNames).toContain(path.relative(process.cwd(), file1Path));
    expect(entryNames).toContain(path.relative(process.cwd(), file3Path)); // inside subdir
  });

  it('should handle empty input', async () => {
    const buffer = await zipFilesToBuffer([]);
    expect(buffer).toBeDefined();
    expect(await listZipEntries(buffer)).toEqual([]);
  });

  it('should throw an error for non-existing paths', async () => {
    await expect(zipFilesToBuffer(['non-existing-file.txt'])).rejects.toThrow();
  });

  it('should throw an error if zip size exceeds limit', async () => {
    const largeFilePath = path.join(testDir, 'largeFile.txt');
    await fs.writeFile(largeFilePath, 'A'.repeat(1_000_000)); // on "data" event is fired after
    await expect(zipFilesToBuffer([largeFilePath], 500)).rejects.toThrow(
      'Zip size exceeded the limit'
    );
  });
});

describe('unzipBuffer', () => {
  const testDir = path.join(__dirname, 'unzip-files');

  afterAll(async () => {
    await fs.remove(testDir);
  });

  it('restores the zipped files and folders', async () => {
    const source = path.join(testDir, 'source');
    await fs.outputFile(path.join(source, 'a.txt'), 'a');
    await fs.outputFile(path.join(source, 'sub', 'b.txt'), 'b');
    await fs.ensureDir(path.join(source, 'empty'));

    const buffer = await zipFilesToBuffer([source]);
    const output = path.join(testDir, 'output');
    await unzipBuffer(buffer, output);

    const restored = path.join(output, path.relative(process.cwd(), source));
    expect(await fs.readFile(path.join(restored, 'a.txt'), 'utf8')).toBe('a');
    expect(await fs.readFile(path.join(restored, 'sub', 'b.txt'), 'utf8')).toBe(
      'b'
    );
    expect((await fs.stat(path.join(restored, 'empty'))).isDirectory()).toBe(
      true
    );
  });
});

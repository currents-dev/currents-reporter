import fs from 'fs-extra';
import path from 'path';
import { Readable } from 'stream';
import unzipper from 'unzipper';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zipFilesToBuffer } from '../fs';

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
    const entries = await unzipBuffer(buffer);
    expect(entries.length).toBe(1);
  });

  it('should zip multiple files', async () => {
    const buffer = await zipFilesToBuffer([file1Path, file2Path]);
    const entries = await unzipBuffer(buffer);
    expect(entries.length).toBe(2);
  });

  it('should zip a directory', async () => {
    const buffer = await zipFilesToBuffer([testDir]);
    const entries = await unzipBuffer(buffer);
    const entryNames = entries.map((entry) => entry.path);

    expect(entryNames).toContain(path.relative(process.cwd(), file1Path));
    expect(entryNames).toContain(path.relative(process.cwd(), file2Path));
    expect(entryNames).toContain(path.relative(process.cwd(), file3Path));
    expect(entryNames).toContain(
      path.relative(process.cwd(), subdirPath) + '/'
    ); // "/" is added by archiver for directories
  });

  it('should zip mixed files and directories', async () => {
    const buffer = await zipFilesToBuffer([file1Path, subdirPath]);
    const entries = await unzipBuffer(buffer);
    const entryNames = entries.map((entry) => entry.path);

    expect(entryNames).toContain(path.relative(process.cwd(), file1Path));
    expect(entryNames).toContain(path.relative(process.cwd(), file3Path)); // inside subdir
  });

  it('should handle empty input', async () => {
    const buffer = await zipFilesToBuffer([]);
    expect(buffer).toBeDefined();
    const zip = Readable.from(buffer).pipe(unzipper.Parse());
    const entries = [];
    await new Promise((resolve) => {
      zip.on('entry', (entry) => entries.push(entry));
      zip.on('close', resolve);
    });
    expect(entries.length).toBe(0);
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

const unzipBuffer = async (buffer: Buffer) => {
  const entries: any[] = [];
  const zip = Readable.from(buffer).pipe(unzipper.Parse());

  zip.on('entry', (entry) => {
    entries.push(entry);
  });

  await new Promise<void>((resolve) => {
    zip.on('close', resolve);
  });

  return entries;
};

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import yauzl from 'yauzl';
import yazl from 'yazl';

const openFile = promisify<string, yauzl.Options, yauzl.ZipFile>(yauzl.open);
const openBuffer = promisify<Buffer, yauzl.Options, yauzl.ZipFile>(
  yauzl.fromBuffer
);

/**
 * Adds a file, or a folder and everything under it, to `zip` as `name`.
 * Entry names use `/`, and yazl refuses a leading `/` or `..`, so they are
 * removed: `../a/b` is stored as `a/b`.
 */
export async function addPath(zip: yazl.ZipFile, fsPath: string, name: string) {
  const entryName = name
    .split(path.sep)
    .join('/')
    .replace(/^(\.\.\/|\/)+/, '');
  const stats = await fs.promises.stat(fsPath);
  if (!stats.isDirectory()) {
    zip.addFile(fsPath, entryName);
    return;
  }
  if (entryName) zip.addEmptyDirectory(entryName);
  for (const child of await fs.promises.readdir(fsPath)) {
    await addPath(
      zip,
      path.join(fsPath, child),
      entryName ? `${entryName}/${child}` : child
    );
  }
}

/**
 * Ends `zip` and returns its bytes. yazl reports a failed file read on the
 * zip, not on its output, so the error is passed to the output stream.
 */
export function finishZip(zip: yazl.ZipFile): Readable {
  const output = zip.outputStream as Readable;
  zip.on('error', (err: Error) => output.destroy(err));
  zip.end();
  return output;
}

function readEntries(
  zip: yauzl.ZipFile,
  onEntry: (entry: yauzl.Entry) => Promise<void> | void
) {
  return new Promise<void>((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => resolve());
    zip.on('entry', (entry: yauzl.Entry) => {
      Promise.resolve(onEntry(entry))
        .then(() => zip.readEntry())
        .catch((err) => {
          zip.close();
          reject(err);
        });
    });
    zip.readEntry();
  });
}

function openZip(source: string | Buffer) {
  const options = { lazyEntries: true };
  return typeof source === 'string'
    ? openFile(source, options)
    : openBuffer(source, options);
}

/** Names of the entries in a zip file or buffer. Reads only the zip's index. */
export async function listZipEntries(source: string | Buffer) {
  const zip = await openZip(source);
  const names: string[] = [];
  await readEntries(zip, (entry) => {
    names.push(entry.fileName);
  });
  return names;
}

/**
 * Writes the entries of a zip buffer under `outputDir`. yauzl rejects entry
 * names that are absolute or contain `..`, so no entry is written outside
 * `outputDir`.
 */
export async function extractZip(buffer: Buffer, outputDir: string) {
  const zip = await openZip(buffer);
  const openReadStream = promisify(zip.openReadStream.bind(zip));
  await readEntries(zip, async (entry) => {
    const target = path.join(outputDir, entry.fileName);
    if (entry.fileName.endsWith('/')) {
      await fs.promises.mkdir(target, { recursive: true });
      return;
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await pipeline(await openReadStream(entry), fs.createWriteStream(target));
  });
}

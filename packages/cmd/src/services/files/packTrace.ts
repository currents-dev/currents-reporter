import Archiver from 'archiver';
import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import { dir as tmpDir } from 'tmp-promise';

/**
 * A zip is a trace when it holds `trace.trace`, as the zip made from a Playwright
 * trace folder does. Any other zip, such as a folder of logs, is an attachment.
 */
export async function isTraceZip(zipPath: string) {
  try {
    const archive = await unzipper.Open.file(zipPath);
    return archive.files.some((file) => file.path === 'trace.trace');
  } catch {
    return false;
  }
}

const TRACE_FILE = /^trace-.*\.trace$/;
const NETWORK_FILE = /^trace-.*\.network$/;

/**
 * Playwright MCP writes `trace-<id>.trace` files to its output directory, so a
 * folder is a trace folder when it holds one.
 */
export async function isTraceFolder(folder: string) {
  const names = await fs.readdir(folder);
  return names.some((name) => TRACE_FILE.test(name));
}

/**
 * A script that loaded is dropped. A dev server serves each module as its own
 * request, and the trace API skips a network log over 64 MB decompressed, which
 * loses the failed requests too. Failed scripts stay.
 */
export function keepNetworkLine(line: string) {
  if (!line) return false;
  try {
    const event = JSON.parse(line);
    const response = event.snapshot?.response;
    if (event.type !== 'resource-snapshot' || !response) return true;
    const loaded = response.status >= 200 && response.status < 400;
    const isScript = /javascript|ecmascript/i.test(
      response.content?.mimeType ?? ''
    );
    return !(loaded && isScript);
  } catch {
    return true;
  }
}

async function readSorted(folder: string, pattern: RegExp) {
  const names = (await fs.readdir(folder)).filter((n) => pattern.test(n));
  return names.sort().map((name) => path.join(folder, name));
}

export async function mergeTraceFiles(folder: string) {
  const parts = await Promise.all(
    (await readSorted(folder, TRACE_FILE)).map((f) => fs.readFile(f, 'utf8'))
  );
  return parts.map((p) => (p.endsWith('\n') ? p : p + '\n')).join('');
}

export async function mergeNetworkFiles(folder: string) {
  const files = await readSorted(folder, NETWORK_FILE);
  const lines: string[] = [];
  for (const file of files) {
    lines.push(...(await fs.readFile(file, 'utf8')).split('\n'));
  }
  return lines.filter(keepNetworkLine).join('\n');
}

/**
 * Packs a Playwright MCP trace folder into the one zip the trace API opens:
 * `trace.trace`, `trace.network`, `screencast/` (where the filmstrip frames
 * are) and `resources/`. The zip goes to a temp directory; `cleanup` removes it.
 */
export async function packTraceFolder(folder: string) {
  const { path: tmp, cleanup } = await tmpDir({ unsafeCleanup: true });
  const zipPath = path.join(tmp, 'trace.zip');

  try {
    const archive = Archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);
    const done = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
    });
    archive.pipe(output);

    archive.append(await mergeTraceFiles(folder), { name: 'trace.trace' });
    archive.append(await mergeNetworkFiles(folder), { name: 'trace.network' });
    for (const sub of ['screencast', 'resources']) {
      const subPath = path.join(folder, sub);
      if (await fs.pathExists(subPath)) archive.directory(subPath, sub);
    }
    await archive.finalize();
    await done;
  } catch (e) {
    await cleanup();
    throw e;
  }

  return { zipPath, cleanup };
}

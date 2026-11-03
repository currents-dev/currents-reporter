import path from 'path';
import yazl from 'yazl';
import { addPath, finishZip } from '../../lib/zip';

export { extractZip as unzipBuffer } from '../../lib/zip';

const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Adds files and directories to an archive while preserving their original folder structure.
 *
 * This function supports various types of paths, including individual files, entire directories,
 * and files located within subdirectories. When the archive is extracted, the original organization
 * will be restored, making navigation straightforward.
 *
 * Paths based on a specific starting point will be stored relative to that point, helping to avoid
 * naming conflicts and maintaining the logical arrangement of files and directories.
 */
export async function zipFilesToBuffer(
  filePaths: string[],
  maxSize: number = MAX_ZIP_SIZE
): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const filePath of filePaths) {
    await addPath(
      zip,
      filePath,
      path.relative(process.cwd(), path.normalize(filePath))
    );
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;
  const output = finishZip(zip);
  for await (const chunk of output) {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      output.destroy();
      throw new Error(`Zip size exceeded the limit of ${maxSize} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

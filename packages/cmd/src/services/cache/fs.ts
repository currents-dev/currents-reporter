import Archiver from "archiver";
import fs from "fs-extra";
import path from "path";
import stream from "stream";
import unzipper from "unzipper";
import { ensurePathExists } from "../../lib";
import { warn } from "../../logger";

const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

// TODO: implement includeHidden
interface ZipOptions {
  includeHidden?: boolean;
}

export async function zipFilesToBuffer(
  filePaths: string[],
  options: ZipOptions = {},
  maxSize: number = MAX_ZIP_SIZE
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = Archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    let totalSize = 0;

    archive.on("data", (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        reject(new Error(`Zip size exceeded the limit of ${maxSize} bytes`));
      }
    });

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        warn(err);
      } else {
        reject(err);
      }
    });

    archive.on("error", (err) => reject(err));

    archive.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });

    const processFile = async (filePath: string) => {
      const baseDir = process.cwd();
      const normalized = path.normalize(filePath);
      const relativePath = path.relative(baseDir, normalized);
      const stats = await fs.stat(relativePath);
      const dirname = path.dirname(relativePath);
      const prefix = dirname === "." ? undefined : dirname;

      if (stats.isDirectory()) {
        archive.directory(relativePath, relativePath, {
          prefix,
          stats,
        });
      } else {
        archive.file(normalized, {
          name: path.basename(relativePath),
          prefix,
          stats,
        });
      }
    };

    const processFiles = async (filePaths: string[]) => {
      for (const filePath of filePaths) {
        if (filePath === ".") {
          const subPaths = await fs.readdir(filePath);
          for (const filePath of subPaths) {
            await processFile(filePath);
          }
        } else {
          await processFile(filePath);
        }
      }

      archive.finalize();
    };

    processFiles(filePaths).catch(reject);
  });
}

export async function unzipBuffer(
  zipBuffer: Buffer,
  outputDir: string,
): Promise<void | { [fileName: string]: Buffer }> {
  return unzipper.Open.buffer(zipBuffer).then((d) =>
    d.extract({ path: outputDir, concurrency: 3 }),
  );
}

export function filterPaths(filePaths: string[]) {
  const baseDir = process.cwd();
  return filePaths.filter((filePath) => {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(baseDir, absolutePath);

    if (filePath.startsWith("..") || path.isAbsolute(relativePath)) {
      warn(
        `Invalid path: "${filePath}". Path traversal detected. The path was skipped.`
      );
      return false;
    }

    return true;
  });
}

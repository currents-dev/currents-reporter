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
      const normalized = path.normalize(filePath);
      const stats = await fs.stat(normalized);
      const dirname = path.dirname(normalized);
      const prefix = dirname === "." ? undefined : dirname;

      if (stats.isDirectory()) {
        archive.directory(normalized, normalized, {
          prefix,
          stats,
        });
      } else {
        archive.file(normalized, {
          name: path.relative(dirname, normalized),
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
  zipBuffer: Buffer
): Promise<{ [fileName: string]: Buffer }> {
  return new Promise((resolve, reject) => {
    const extractedFiles: { [fileName: string]: Buffer } = {};
    const readStream = new stream.Readable();

    readStream.push(zipBuffer);
    readStream.push(null);

    readStream
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        const fileName = entry.path;
        const buffers: Buffer[] = [];

        entry.on("data", (chunk: Buffer) => buffers.push(chunk));

        entry.on("end", () => {
          extractedFiles[fileName] = Buffer.concat(buffers);
        });
      })
      .on("finish", () => {
        resolve(extractedFiles);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

export async function writeUnzippedFilesToDisk(
  files: { [fileName: string]: Buffer },
  outputDir?: string
): Promise<void> {
  console.log(files);
  for (const [fileName, fileData] of Object.entries(files)) {
    const outputPath = outputDir ? path.join(outputDir, fileName) : fileName;

    await ensurePathExists(outputPath);
    await fs.writeFile(outputPath, fileData);
  }
}

export function filterPaths(filePaths: string[]) {
  const baseDir = process.cwd();
  return filePaths.filter((filePath) => {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(baseDir, absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      warn(
        `Invalid path: "${filePath}". Path traversal detected. The path was skipped.`
      );
      return false;
    }

    return true;
  });
}

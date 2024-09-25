import fs from "fs-extra";
import path from "path";

export function getRelativeFileLocation(aPath: string, rootDir: string) {
  return toPosixPath(path.relative(rootDir, aPath));
}

function toPosixPath(aPath: string): string {
  return aPath.split(path.sep).join(path.posix.sep);
}

export async function readFileContents(filePath: string) {
  const exists = await fs.pathExists(filePath);
  if (!exists) throw new Error("File does not exist");

  return exists;
}

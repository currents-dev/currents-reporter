import path from "path";

export function getRelativeFileLocation(aPath: string, rootDir: string) {
  return toPosixPath(path.relative(rootDir, aPath));
}

function toPosixPath(aPath: string): string {
  return aPath.split(path.sep).join(path.posix.sep);
}

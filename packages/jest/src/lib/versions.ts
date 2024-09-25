import path from "path";
import fs from "fs";
import { debug } from "./debug";

export function getJestVersion() {
  return getPackageVersion("jest");
}

export function getPackageVersion(packageName: string): string | null {
  try {
    const packagePath = require.resolve(path.join(packageName, "package.json"));
    const packageJsonContent = fs.readFileSync(packagePath, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson.version;
  } catch (error) {
    debug('Failed to obtain the package version "%s": %o', packageName, error);
    return null;
  }
}

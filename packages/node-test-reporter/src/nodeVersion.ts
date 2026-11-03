import pkg from '../package.json';

/**
 * Throws when `version` is older than `engines.node` in package.json. npm only
 * warns about `engines`, so without this check an older Node.js fails later,
 * on a missing API.
 */
export function assertNodeVersion(version = process.versions.node) {
  const [minMajor, minMinor = 0] = parseVersion(
    pkg.engines.node.replace('>=', '')
  );
  const [major, minor] = parseVersion(version);
  if (major > minMajor || (major === minMajor && minor >= minMinor)) {
    return;
  }
  const previousMajor = parseVersion(pkg.version)[0] - 1;
  throw new Error(
    `${pkg.name} requires Node.js ${minMajor}.${minMinor} or later. This is Node.js ${version}. Upgrade Node.js, or use ${pkg.name}@${previousMajor} with older Node.js versions.`
  );
}

function parseVersion(version: string) {
  return version.replace(/^v/, '').split('.').map(Number);
}

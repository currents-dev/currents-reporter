import pkg from '../../../package.json';
import { assertNodeVersion } from '../nodeVersion';

describe('assertNodeVersion', () => {
  it.each(['22.13.0', '22.13.1', '22.20.0', '24.0.0', '26.1.0', 'v22.13.0'])(
    'accepts Node.js %s',
    (version) => {
      expect(() => assertNodeVersion(version)).not.toThrow();
    }
  );

  it.each(['22.12.9', '22.0.0', '20.19.0', '18.20.4', 'v20.0.0'])(
    'refuses Node.js %s, naming the previous major version',
    (version) => {
      const previousMajor = Number(pkg.version.split('.')[0]) - 1;
      expect(() => assertNodeVersion(version)).toThrow(
        `${pkg.name} requires Node.js 22.13 or later. This is Node.js ${version}. Upgrade Node.js, or use ${pkg.name}@${previousMajor} with older Node.js versions.`
      );
    }
  );

  it('accepts the Node.js that runs the tests', () => {
    expect(() => assertNodeVersion()).not.toThrow();
  });
});

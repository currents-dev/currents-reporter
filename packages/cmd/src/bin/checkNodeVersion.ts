import { assertNodeVersion } from '../env/nodeVersion';

try {
  assertNodeVersion();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const builtCli = path.join(__dirname, 'dist/bin/index.js');

// Tests that spawn the CLI need dist/. An existing dist/ is used as it is, so
// after changing the source run `npm run build` again.
export default function setup() {
  if (process.env.CURRENTS_TEST_CLI || fs.existsSync(builtCli)) {
    return;
  }
  execSync('npx tsup-node --minify', { cwd: __dirname, stdio: 'inherit' });
}

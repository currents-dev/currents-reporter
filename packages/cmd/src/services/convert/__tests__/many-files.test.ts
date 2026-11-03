import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cliPath } from '../../../test-utils/cli';

const FILES = 2000;

// Each JUnit file is a spec with an artifact, so the conversion reads, copies
// and writes a file per spec. The limit on open files is far
// below the number of specs.
describe.skipIf(process.platform === 'win32')(
  'currents convert with more files than the open file limit',
  () => {
    let workDir: string;

    beforeAll(() => {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currents-many-files-'));
      fs.mkdirSync(path.join(workDir, 'junit'));
      fs.mkdirSync(path.join(workDir, 'files'));
      for (let i = 0; i < FILES; i++) {
        fs.writeFileSync(path.join(workDir, 'files', `a${i}.txt`), 'x');
        fs.writeFileSync(
          path.join(workDir, 'junit', `r${i}.xml`),
          `<testsuites><testsuite name="s${i}" file="spec${i}.test.ts" tests="1">
<testcase name="t${i}" classname="spec${i}.test.ts" time="0.1">
<properties>
<property name="currents.artifact.test.path" value="files/a${i}.txt"/>
<property name="currents.artifact.test.type" value="attachment"/>
</properties>
<system-out>out ${i}</system-out>
</testcase></testsuite></testsuites>`
        );
      }
    });

    afterAll(() => {
      fs.rmSync(workDir, { recursive: true, force: true });
    });

    it('converts every file', async () => {
      // bash sets the hard limit too; Node raises a lower soft limit to it
      const result = await new Promise<{ code: number; output: string }>(
        (resolve) => {
          execFile(
            'bash',
            [
              '-c',
              'ulimit -n 256 && exec "$@"',
              'bash',
              process.execPath,
              cliPath,
              'convert',
              '--input-format=junit',
              '--input-file=junit/*.xml',
              '--output-dir=out',
              '--framework=vitest',
            ],
            { cwd: workDir },
            (error, stdout, stderr) =>
              resolve({
                code: error ? Number(error.code ?? 1) : 0,
                output: stdout + stderr,
              })
          );
        }
      );

      expect(result.output).not.toMatch(/EMFILE/);
      expect(result.code).toBe(0);
      const out = path.join(workDir, 'out');
      expect(fs.readdirSync(path.join(out, 'instances'))).toHaveLength(FILES);
      expect(fs.readdirSync(path.join(out, 'artifacts'))).toHaveLength(FILES);
    }, 60_000);
  }
);

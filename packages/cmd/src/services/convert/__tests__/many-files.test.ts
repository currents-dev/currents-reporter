import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../../test-utils/cli';

const FILES = 2000;

// Each JUnit file is a spec with an attachment and stdout, so the conversion
// reads, copies and writes files per spec. The limit on open files is far
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
<property name="currents.artifact.test.contentType" value="text/plain"/>
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
      const result = await runCli(
        [
          'convert',
          '--input-format=junit',
          '--input-file=junit/*.xml',
          '--output-dir=out',
          '--framework=vitest',
        ],
        { cwd: workDir, maxOpenFiles: 256 }
      );

      expect(result.stdout + result.stderr).not.toMatch(/EMFILE/);
      expect(result.code).toBe(0);
      const out = path.join(workDir, 'out');
      expect(fs.readdirSync(path.join(out, 'instances'))).toHaveLength(FILES);
      // A copy of the attachment and a stdout file per spec
      expect(fs.readdirSync(path.join(out, 'artifacts'))).toHaveLength(
        FILES * 2
      );
    }, 60_000);
  }
);

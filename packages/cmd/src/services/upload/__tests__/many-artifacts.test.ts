import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../../test-utils/api-server';
import { runCli } from '../../../test-utils/cli';

const SPECS = 600;

// The storage answers each artifact upload after 200 ms, so uploads that start
// at once keep their sockets open together. The limit on open files is far
// below the number of artifacts.
describe.skipIf(process.platform === 'win32')(
  'currents run upload with more artifacts than the open file limit',
  () => {
    let api: ApiServer;
    let workDir: string;

    beforeAll(async () => {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currents-artifacts-'));
      fs.mkdirSync(path.join(workDir, 'junit'));
      fs.mkdirSync(path.join(workDir, 'files'));
      for (let i = 0; i < SPECS; i++) {
        fs.writeFileSync(path.join(workDir, 'files', `a${i}.txt`), `${i}`);
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
      api = await startApiServer(respond);
    });

    afterAll(async () => {
      await api.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    });

    async function respond(request: RecordedRequest) {
      if (request.url.startsWith('/rules/project/')) {
        return { status: 200, json: { rules: [] } };
      }
      if (request.method === 'PUT') {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { status: 200 };
      }
      type Artifacts = { artifacts?: { path: string }[] };
      const instances: (Artifacts & {
        results: { tests: (Artifacts & { attempts: Artifacts[] })[] };
      })[] = request.json.instances;
      const artifacts = instances.flatMap((instance) => [
        ...(instance.artifacts ?? []),
        ...instance.results.tests.flatMap((test) => [
          ...(test.artifacts ?? []),
          ...test.attempts.flatMap((attempt) => attempt.artifacts ?? []),
        ]),
      ]);
      return {
        status: 200,
        json: {
          runId: 'run',
          groupId: request.json.group,
          runUrl: `${api.url}/run`,
          artifactUploadUrls: artifacts.map(({ path }, index) => ({
            artifactId: `artifact-${index}`,
            path,
            uploadUrl: `${api.url}/upload?path=${encodeURIComponent(path)}`,
            readUrl: `${api.url}/read/${index}`,
          })),
        },
      };
    }

    it('uploads every artifact', async () => {
      const result = await runCli(
        [
          'run',
          'upload',
          '--input-format=junit',
          '--input-file=junit/*.xml',
          '--framework=vitest',
          '--output-dir=out',
          '--key=record-key',
          '--project-id=project',
          '--ci-build-id=build',
        ],
        {
          cwd: workDir,
          env: { CURRENTS_API_URL: api.url },
          maxOpenFiles: 256,
        }
      );

      expect(result.stdout + result.stderr).not.toMatch(/EMFILE/);
      expect(result.code).toBe(0);
      const uploads = api.requests.filter((r) => r.method === 'PUT');
      // An attachment and a stdout file per spec
      expect(new Set(uploads.map((r) => r.url)).size).toBe(SPECS * 2);
    }, 120_000);
  }
);

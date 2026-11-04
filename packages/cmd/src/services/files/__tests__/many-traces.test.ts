import fs from 'fs';
import os from 'os';
import path from 'path';
import unzipper from 'unzipper';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiServer,
  RecordedRequest,
  startApiServer,
} from '../../../test-utils/api-server';
import { runCli } from '../../../test-utils/cli';

const TRACE_FILES = 300;

// A Playwright MCP trace folder with more trace files than the limit on open
// files. Attaching it packs every trace file into one trace.zip.
describe.skipIf(process.platform === 'win32')(
  'currents session attach with more trace files than the open file limit',
  () => {
    let api: ApiServer;
    let workDir: string;

    beforeAll(async () => {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currents-traces-'));
      fs.mkdirSync(path.join(workDir, 'traces'));
      for (let i = 0; i < TRACE_FILES; i++) {
        fs.writeFileSync(
          path.join(workDir, 'traces', `trace-${i}.trace`),
          `{"i":${i}}`
        );
      }
      api = await startApiServer(respond);
    });

    afterAll(async () => {
      await api.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    });

    function respond(request: RecordedRequest) {
      if (request.method === 'PUT') return { status: 200 };
      return {
        status: 200,
        json: {
          status: 'OK',
          data: {
            uploadExpiresInSeconds: 600,
            attachments: request.json.attachments.map(
              (file: { name: string; contentType: string }, index: number) => ({
                attachmentId: `a${index}`,
                name: file.name,
                type: 'trace',
                uploadUrl: `${api.url}/upload/${index}`,
              })
            ),
          },
        },
      };
    }

    it('packs every trace file in name order', async () => {
      const result = await runCli(
        [
          'session',
          'attach',
          '--api-key=api-key',
          '--session-id=sess1',
          'traces',
        ],
        {
          cwd: workDir,
          env: { CURRENTS_REST_API_URL: api.url },
          maxOpenFiles: 256,
        }
      );

      expect(result.stdout + result.stderr).not.toMatch(/EMFILE/);
      expect(result.code).toBe(0);
      const [upload] = api.requests.filter((r) => r.method === 'PUT');
      const zip = await unzipper.Open.buffer(upload.body);
      const trace = zip.files.find((f) => f.path === 'trace.trace')!;
      const expected = fs
        .readdirSync(path.join(workDir, 'traces'))
        .sort()
        .map((name) =>
          fs.readFileSync(path.join(workDir, 'traces', name), 'utf8')
        )
        .join('\n');
      expect((await trace.buffer()).toString()).toBe(expected + '\n');
    }, 60_000);
  }
);

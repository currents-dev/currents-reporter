import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiServer, startApiServer } from '../../test-utils/api-server';
import { runCli } from '../../test-utils/cli';

const TOKEN = 'glcbt-64_SECRET_JOB_TOKEN';
const REPOSITORY_URL = `https://gitlab-ci-token:${TOKEN}@gitlab.com/org/repo.git`;

const junitFile = join(
  __dirname,
  '../../services/convert/__tests__/fixtures/junit/vitest.xml'
);

// GitLab clones with the job token in the remote and sets it in
// CI_REPOSITORY_URL.
describe('a GitLab job, with the built CLI', () => {
  let api: ApiServer;
  let repo: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(join(os.tmpdir(), 'currents-gitlab-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Jane',
          GIT_AUTHOR_EMAIL: 'jane@example.com',
          GIT_COMMITTER_NAME: 'Jane',
          GIT_COMMITTER_EMAIL: 'jane@example.com',
        },
      });
    git('init', '-q');
    git(
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'm'
    );
    git('checkout', '-q', '--detach');
    git('remote', 'add', 'origin', REPOSITORY_URL);
    await fs.copy(junitFile, join(repo, 'vitest.xml'));

    api = await startApiServer(() => ({
      status: 200,
      json: { runId: 'run', groupId: 'g', runUrl: `${api.url}/run` },
    }));
  });

  afterEach(async () => {
    await api.close();
    await fs.remove(repo);
  });

  it('sends the job token nowhere', async () => {
    const result = await runCli(
      [
        'run',
        'upload',
        '--input-format',
        'junit',
        '--input-file',
        join(repo, 'vitest.xml'),
        '--framework',
        'vitest',
        '--output-dir',
        join(repo, 'out'),
        '--key',
        'record-key',
        '--project-id',
        'project',
        '--debug',
      ],
      {
        cwd: repo,
        env: {
          CURRENTS_API_URL: api.url,
          DEBUG: 'currents*',
          CI: 'true',
          GITLAB_CI: 'true',
          CI_PIPELINE_ID: '55',
          CI_COMMIT_REF_NAME: 'feature/x',
          CI_REPOSITORY_URL: REPOSITORY_URL,
          CI_PROJECT_URL: 'https://gitlab.com/org/repo',
        },
      }
    );

    expect(result.code).toBe(0);
    const run = api.requests.find((r) => r.method === 'POST')?.json;
    expect(run.commit).toMatchObject({
      branch: 'feature/x',
      remoteOrigin: 'https://gitlab.com/org/repo.git',
    });
    expect(run.ci.params.ciRepositoryUrl).toBe(
      'https://gitlab.com/org/repo.git'
    );

    // the debug output has the commit and the CI params, so the check below
    // covers them
    expect(result.stderr).toContain('detected CI params');
    const everything = [
      result.stdout,
      result.stderr,
      ...api.requests.map((r) => r.body.toString()),
      ...api.requests.map((r) => JSON.stringify(r.json ?? null)),
    ].join('\n');
    expect(everything).not.toContain(TOKEN);
  });
});

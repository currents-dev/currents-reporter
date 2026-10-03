import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttachments, createSession, createShare } from '../../../api';
import { sendFile } from '../../../http/storage';
import { getRunFilesCommand } from '../../run';
import { getSessionCommand } from '../index';

vi.mock('../../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api')>()),
  createSession: vi.fn(),
  createAttachments: vi.fn(),
  createShare: vi.fn(),
}));
const detectedCI = vi.hoisted(() => ({ source: 'server' as string }));
vi.mock('@env/ciProvider', () => ({
  getCI: () => ({
    provider: 'github',
    params: { githubRepository: 'o/r' },
    ciBuildId: { source: detectedCI.source, value: null },
  }),
}));
vi.mock('../../../http/storage', () => ({ sendFile: vi.fn() }));
vi.mock('@env/gitInfo', () => ({
  getGitInfo: vi.fn().mockResolvedValue({
    sha: 'abc',
    branch: 'main',
    message: 'm',
    authorName: 'n',
    authorEmail: 'e',
    remoteOrigin: 'git@github.com:o/r.git',
    defaultBranch: null,
  }),
}));

const run = (command: ReturnType<typeof getSessionCommand>, args: string[]) =>
  command.parseAsync(args, { from: 'user' });

describe('session and run attach commands', () => {
  let dir: string;
  let cwd: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    detectedCI.source = 'server';
    for (const key of [
      'CURRENTS_API_KEY',
      'CURRENTS_RECORD_KEY',
      'CURRENTS_PROJECT_ID',
      'CURRENTS_SESSION_ID',
      'CURRENTS_CI_BUILD_ID',
      'CURRENTS_MACHINE_ID',
    ]) {
      vi.stubEnv(key, undefined);
    }
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-'));
    cwd = process.cwd();
    process.chdir(dir);
    vi.mocked(createSession).mockResolvedValue({ sessionId: 'sess-1' });
    vi.mocked(createAttachments).mockImplementation(
      async (_credentials, _owner, _target, attachments) => ({
        level: 'attempt',
        uploadExpiresInSeconds: 600,
        attachments: attachments.map((f, i) => ({
          attachmentId: `a${i}`,
          name: f.name,
          type: f.type,
          uploadUrl: `https://storage/${f.name}`,
          uploadHeaders: { 'Content-Type': f.contentType },
        })),
      })
    );
  });

  afterEach(async () => {
    process.chdir(cwd);
    await fs.remove(dir);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('starts a session with git data and saves it', async () => {
    await run(getSessionCommand('currents'), [
      'start',
      '--api-key',
      'k',
      '-p',
      'proj',
      '--title',
      'Bug',
      '--status',
      'failed',
      '--error',
      'boom',
      '-t',
      'a,b',
      '--tag',
      'c',
      '--pr',
      'https://github.com/o/r/pull/3',
    ]);

    expect(createSession).toHaveBeenCalledWith(
      'k',
      expect.objectContaining({
        projectId: 'proj',
        title: 'Bug',
        status: 'failed',
        error: 'boom',
        tags: ['a', 'b', 'c'],
        pr: { link: 'https://github.com/o/r/pull/3' },
        commit: expect.objectContaining({ sha: 'abc', branch: 'main' }),
        ci: expect.any(Object),
      })
    );
    const params = vi.mocked(createSession).mock.calls[0][1];
    expect(params.commit).not.toHaveProperty('defaultBranch');
    expect(params.ci).not.toHaveProperty('ciBuildId');
    expect(await fs.readFile('.currents-session/.gitignore', 'utf8')).toBe(
      '*\n'
    );
    // The reporters own .currents; the session commands leave it alone.
    expect(await fs.pathExists('.currents')).toBe(false);
    expect(await fs.readJson('.currents-session/session.json')).toEqual({
      sessionId: 'sess-1',
      projectId: 'proj',
    });
  });

  it('prints only JSON on stdout with --json', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    await run(getSessionCommand('currents'), [
      'start',
      '--api-key',
      'k',
      '-p',
      'proj',
      '--title',
      'Bug',
      '--json',
    ]);
    expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual({
      sessionId: 'sess-1',
    });
  });

  it('attaches files to the saved session and uploads each one', async () => {
    await fs.outputJson('.currents-session/session.json', {
      sessionId: 'sess-1',
    });
    await fs.outputFile('before.png', 'png');
    await fs.outputFile('notes.txt', 'text');

    await run(getSessionCommand('currents'), [
      'attach',
      '--api-key',
      'k',
      '--caption',
      'before',
      '--meta',
      'step=1',
      'before.png',
      'notes.txt',
    ]);

    expect(createAttachments).toHaveBeenCalledWith(
      { apiKey: 'k' },
      { sessionId: 'sess-1' },
      {},
      [
        {
          name: 'before.png',
          type: 'screenshot',
          contentType: 'image/png',
          sizeBytes: 3,
          caption: 'before',
          meta: { step: '1' },
        },
        expect.objectContaining({ name: 'notes.txt', type: 'attachment' }),
      ]
    );
    expect(sendFile).toHaveBeenCalledTimes(2);
    for (const [upload] of vi.mocked(sendFile).mock.calls) {
      expect(upload.headers).toEqual({ 'Content-Type': upload.contentType });
    }
    expect(
      vi
        .mocked(sendFile)
        .mock.calls.map(([u]) => u.uploadUrl)
        .sort()
    ).toEqual(['https://storage/before.png', 'https://storage/notes.txt']);
  });

  it('reads the run ID of a session saved before sessions had IDs, and --session-id wins', async () => {
    await fs.outputJson('.currents-session/session.json', { runId: 'old-run' });
    await fs.outputFile('a.txt', 'a');
    await run(getSessionCommand('currents'), [
      'attach',
      '--api-key',
      'k',
      'a.txt',
    ]);
    expect(vi.mocked(createAttachments).mock.calls[0][1]).toEqual({
      sessionId: 'old-run',
    });

    await run(getSessionCommand('currents'), [
      'attach',
      '--api-key',
      'k',
      '--session-id',
      'other',
      'a.txt',
    ]);
    expect(vi.mocked(createAttachments).mock.calls[1][1]).toEqual({
      sessionId: 'other',
    });
  });

  it('takes a trace on a session, which has no target', async () => {
    await fs.outputFile('a.txt', 'a');
    await run(getSessionCommand('currents'), [
      'attach',
      '--api-key',
      'k',
      '--session-id',
      's',
      '--type',
      'trace',
      'a.txt',
    ]);
    // a.txt is not a zip, so the type check refuses it before any request.
    expect(createAttachments).not.toHaveBeenCalled();
  });

  it('fails without a session', async () => {
    await fs.outputFile('a.txt', 'a');
    await run(getSessionCommand('currents'), [
      'attach',
      '--api-key',
      'k',
      'a.txt',
    ]);
    expect(createAttachments).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('shares the session', async () => {
    await fs.outputJson('.currents-session/session.json', {
      sessionId: 'sess-1',
    });
    vi.mocked(createShare).mockResolvedValue({
      purpose: 'report',
      url: 'u.md',
      pageUrl: 'https://share/x',
      expiresAt: '',
    });
    await run(getSessionCommand('currents'), [
      'share',
      '--api-key',
      'k',
      '--expires-in-days',
      '3',
    ]);
    expect(createShare).toHaveBeenCalledWith('k', {
      sessionId: 'sess-1',
      purpose: 'report',
      expiresInDays: 3,
    });
    expect(vi.mocked(console.log).mock.calls[0][0]).toBe('https://share/x');
  });

  it('attaches run-level files by machine with a record key', async () => {
    await fs.outputFile('logs.zip', 'zip');
    await run(getRunFilesCommand('currents') as never, [
      'attach',
      '--key',
      'rk',
      '-p',
      'proj',
      '--ci-build-id',
      'build-1',
      '--machine-id',
      'm1',
      'logs.zip',
    ]);
    expect(createAttachments).toHaveBeenCalledWith(
      { apiKey: undefined, recordKey: 'rk' },
      { projectId: 'proj', ciBuildId: 'build-1' },
      expect.objectContaining({ machineId: 'm1' }),
      [expect.objectContaining({ name: 'logs.zip', type: 'attachment' })]
    );
  });

  it('attaches files to the whole run without --machine-id', async () => {
    await fs.outputFile('logs.zip', 'zip');
    await run(getRunFilesCommand('currents') as never, [
      'attach',
      '--key',
      'rk',
      '-p',
      'proj',
      '--ci-build-id',
      'build-1',
      'logs.zip',
    ]);
    const [, , target] = vi.mocked(createAttachments).mock.calls[0];
    expect(target).toEqual(expect.objectContaining({ machineId: undefined }));
    expect(target).not.toEqual(
      expect.objectContaining({ spec: expect.anything() })
    );
  });

  it('sends the CI environment when no CI build ID is given', async () => {
    await fs.outputFile('logs.zip', 'zip');
    await run(getRunFilesCommand('currents') as never, [
      'attach',
      '--key',
      'rk',
      '-p',
      'proj',
      '--machine-id',
      'm1',
      'logs.zip',
    ]);
    const [, owner] = vi.mocked(createAttachments).mock.calls[0];
    expect(owner).toEqual({
      projectId: 'proj',
      ci: expect.objectContaining({ params: expect.any(Object) }),
    });
    expect(owner).not.toHaveProperty('ciBuildId');
  });

  it('asks for --ci-build-id when the CI environment does not give one', async () => {
    detectedCI.source = 'random';
    await fs.outputFile('logs.zip', 'zip');
    await run(getRunFilesCommand('currents') as never, [
      'attach',
      '--key',
      'rk',
      '-p',
      'proj',
      '--machine-id',
      'm1',
      'logs.zip',
    ]);
    expect(createAttachments).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('sends the group with a spec and refuses a bad meta key', async () => {
    await fs.outputFile('a.png', 'png');
    await run(getRunFilesCommand('currents') as never, [
      'attach',
      '--key',
      'rk',
      '-p',
      'proj',
      '--ci-build-id',
      'b',
      '--spec',
      's.spec.ts',
      '--group',
      'g1',
      'a.png',
    ]);
    expect(vi.mocked(createAttachments).mock.calls[0][2]).toMatchObject({
      spec: 's.spec.ts',
      groupId: 'g1',
    });

    vi.mocked(createAttachments).mockClear();
    await run(getRunFilesCommand('currents') as never, [
      'attach',
      '--key',
      'rk',
      '-p',
      'proj',
      '--ci-build-id',
      'b',
      '--spec',
      's.spec.ts',
      '--meta',
      'bad key=1',
      'a.png',
    ]);
    expect(createAttachments).not.toHaveBeenCalled();
  });

  it('treats a saved session without an ID as no session', async () => {
    await fs.outputJson('.currents-session/session.json', { sessionId: ' ' });
    await fs.outputFile('a.txt', 'a');
    await run(getSessionCommand('currents'), [
      'attach',
      '--api-key',
      'k',
      'a.txt',
    ]);
    expect(createAttachments).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it.each([
    [['--test-title', 't']],
    [['--spec', 's.ts', '--attempt', '1']],
    [['--group', 'g']],
  ])(
    'refuses a test title or group without a spec, or an attempt without a test: %s',
    async (args) => {
      await fs.outputFile('a.txt', 'a');
      await run(getRunFilesCommand('currents') as never, [
        'attach',
        '--key',
        'rk',
        '-p',
        'proj',
        '--ci-build-id',
        'b',
        ...args,
        'a.txt',
      ]);
      expect(createAttachments).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    }
  );
});

describe('parsePr', () => {
  it('sends a number as an id and anything else as a link', async () => {
    const { parsePr } = await import('../../../services/session');
    expect(parsePr('12')).toEqual({ id: '12' });
    expect(parsePr('https://github.com/o/r/pull/12')).toEqual({
      link: 'https://github.com/o/r/pull/12',
    });
    expect(parsePr()).toBeUndefined();
  });
});

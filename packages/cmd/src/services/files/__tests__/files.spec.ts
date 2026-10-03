import Archiver from 'archiver';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import unzipper from 'unzipper';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectFiles } from '../collect';
import { ALLOWED_TYPES, getFileLevel } from '../levels';
import { assertTypeMatchesFile, getContentType, getFileType } from '../detect';
import { keepNetworkLine, mergeNetworkFiles } from '../packTrace';
import {
  attachFiles,
  chunkFiles,
  MAX_BYTES_PER_REQUEST,
  parseMeta,
} from '../attach';

describe('getFileType', () => {
  it('picks the type from the extension', () => {
    const options = ALLOWED_TYPES.attempt;
    expect(getFileType('a.zip', options)).toBe('trace');
    expect(getFileType('a.PNG', options)).toBe('screenshot');
    expect(getFileType('a.jpeg', options)).toBe('screenshot');
    expect(getFileType('a.webm', options)).toBe('video');
    expect(getFileType('a.mp4', options)).toBe('video');
    expect(getFileType('a.svg', options)).toBe('attachment');
    expect(getFileType('a.txt', options)).toBe('attachment');
    expect(getFileType('noext', options)).toBe('attachment');
  });

  it('makes a zip an attachment where no trace is accepted', () => {
    expect(getFileType('logs.zip', ALLOWED_TYPES.run)).toBe('attachment');
  });

  it('refuses a type that does not fit the file', () => {
    expect(getContentType('a.zip')).toBe('application/zip');
    expect(() => assertTypeMatchesFile('a.txt', 'trace')).toThrow(/trace/);
    expect(() => assertTypeMatchesFile('a.zip', 'attachment')).not.toThrow();
  });
});

describe('getContentType', () => {
  it('is a bare type/subtype, with no parameters', () => {
    for (const name of [
      'a.txt',
      'a.json',
      'a.html',
      'a.md',
      'a.csv',
      'a.log',
      'a.png',
      'noext',
    ]) {
      expect(getContentType(name)).toMatch(/^[\w.+-]+\/[\w.+-]+$/);
    }
  });
});

describe('parseMeta', () => {
  it('splits on the first equals sign', () => {
    expect(parseMeta(['a=1', 'url=http://x?y=1'])).toEqual({
      a: '1',
      url: 'http://x?y=1',
    });
    expect(parseMeta([])).toBeUndefined();
    expect(() => parseMeta(['novalue'])).toThrow(/key=value/);
    expect(() => parseMeta(['a b=1'])).toThrow(/letters, digits/);
  });

  it('keeps __proto__ as an ordinary key', () => {
    const meta = parseMeta(['__proto__=x']);
    expect(Object.keys(meta ?? {})).toEqual(['__proto__']);
    expect(JSON.stringify(meta)).toBe('{"__proto__":"x"}');
  });
});

describe('keepNetworkLine', () => {
  const snapshot = (status: number, mimeType: string) =>
    JSON.stringify({
      type: 'resource-snapshot',
      snapshot: { response: { status, content: { mimeType } } },
    });

  it('drops scripts that loaded and keeps the rest', () => {
    expect(keepNetworkLine(snapshot(200, 'text/javascript'))).toBe(false);
    expect(keepNetworkLine(snapshot(304, 'application/javascript'))).toBe(
      false
    );
    expect(keepNetworkLine(snapshot(500, 'text/javascript'))).toBe(true);
    expect(keepNetworkLine(snapshot(200, 'text/html'))).toBe(true);
    expect(keepNetworkLine('not json')).toBe(true);
    expect(keepNetworkLine('')).toBe(false);
  });
});

describe('collectFiles', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'collect-'));
  });
  afterEach(async () => {
    await fs.remove(dir);
  });

  it('collects a file and the files directly in a folder', async () => {
    const logs = path.join(dir, 'logs');
    await fs.outputFile(path.join(logs, 'a.log'), 'aaa');
    await fs.outputFile(path.join(logs, 'nested', 'b.log'), 'b');
    await fs.outputFile(path.join(dir, 'shot.png'), 'png');

    const { files, cleanup } = await collectFiles(
      [path.join(dir, 'shot.png'), logs],
      { allowedTypes: ALLOWED_TYPES.attempt }
    );
    await cleanup();

    expect(files.map((f) => [f.name, f.type, f.sizeBytes])).toEqual([
      ['shot.png', 'screenshot', 3],
      ['a.log', 'attachment', 3],
    ]);
  });

  it('packs a folder of Playwright MCP trace files into one trace zip', async () => {
    const traces = path.join(dir, 'traces');
    await fs.outputFile(path.join(traces, 'trace-1.trace'), '{"a":1}\n');
    await fs.outputFile(path.join(traces, 'trace-2.trace'), '{"b":2}');
    await fs.outputFile(
      path.join(traces, 'trace-1.network'),
      [
        JSON.stringify({
          type: 'resource-snapshot',
          snapshot: {
            response: { status: 200, content: { mimeType: 'text/javascript' } },
          },
        }),
        JSON.stringify({
          type: 'resource-snapshot',
          snapshot: {
            response: { status: 500, content: { mimeType: 'text/html' } },
          },
        }),
      ].join('\n')
    );
    await fs.outputFile(path.join(traces, 'screencast', 'f1.jpeg'), 'x');
    await fs.outputFile(path.join(traces, 'resources', 'r1'), 'y');

    const { files, cleanup } = await collectFiles([traces], {
      allowedTypes: ALLOWED_TYPES.attempt,
    });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      name: expect.stringMatching(/^trace-\w{8}\.zip$/),
      type: 'trace',
      contentType: 'application/zip',
    });

    const archive = await unzipper.Open.file(files[0].path);
    const names = archive.files.map((f) => f.path).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'trace.trace',
        'trace.network',
        'screencast/f1.jpeg',
        'resources/r1',
      ])
    );
    const trace = archive.files.find((f) => f.path === 'trace.trace')!;
    expect((await trace.buffer()).toString()).toBe('{"a":1}\n{"b":2}\n');
    const network = archive.files.find((f) => f.path === 'trace.network')!;
    expect((await network.buffer()).toString().split('\n')).toHaveLength(1);

    const zipPath = files[0].path;
    await cleanup();
    expect(await fs.pathExists(zipPath)).toBe(false);
  });

  it('attaches a trace folder as a zip attachment where no trace is accepted', async () => {
    await fs.outputFile(path.join(dir, 'trace-1.trace'), '{}');
    const { files, cleanup } = await collectFiles([dir], {
      allowedTypes: ALLOWED_TYPES.run,
    });
    await cleanup();
    expect(files[0].type).toBe('attachment');
  });

  it('leaves out hidden files, links, folders and empty files of a folder', async () => {
    const logs = path.join(dir, 'logs');
    await fs.outputFile(path.join(logs, 'a.log'), 'a');
    await fs.outputFile(path.join(logs, '.env'), 'SECRET=1');
    await fs.outputFile(path.join(logs, '.DS_Store'), 'x');
    await fs.outputFile(path.join(logs, 'empty.log'), '');
    await fs
      .ensureSymlink(path.join(dir, 'outside.txt'), path.join(logs, 'link.txt'))
      .catch(() => undefined);
    await fs.outputFile(path.join(dir, 'outside.txt'), 'outside');
    await fs.outputFile(path.join(logs, 'sub', 'b.log'), 'b');

    const { files, cleanup } = await collectFiles([logs], {
      allowedTypes: ALLOWED_TYPES.run,
    });
    await cleanup();
    expect(files.map((f) => f.name)).toEqual(['a.log']);
  });

  it.each([
    '.env.local',
    '.envrc',
    '.env-production',
    '.env_local',
    'prod.env',
  ])('refuses the environment file %s even when it is named', async (name) => {
    await fs.outputFile(path.join(dir, name), 'SECRET=1');
    await expect(
      collectFiles([path.join(dir, name)], {
        allowedTypes: ALLOWED_TYPES.run,
      })
    ).rejects.toThrow(/environment file/);
  });

  it('leaves out keys and environment files of a folder', async () => {
    const out = path.join(dir, 'out');
    await fs.outputFile(path.join(out, 'a.log'), 'a');
    for (const name of [
      'server.pem',
      'tls.key',
      'id_rsa',
      'id_ed25519.pub',
      'prod.env',
    ]) {
      await fs.outputFile(path.join(out, name), 'secret');
    }
    const { files, cleanup } = await collectFiles([out], {
      allowedTypes: ALLOWED_TYPES.run,
    });
    await cleanup();
    expect(files.map((f) => f.name)).toEqual(['a.log']);
  });

  it('packs the traces folder of a Playwright MCP output folder and attaches the rest', async () => {
    const out = path.join(dir, '.playwright-mcp');
    await fs.outputFile(path.join(out, 'traces', 'trace-1.trace'), '{}\n');
    await fs.outputFile(path.join(out, 'page-1.yml'), '- heading');
    const { files, cleanup } = await collectFiles([out], {
      allowedTypes: ALLOWED_TYPES.attempt,
    });
    await cleanup();
    expect(files.map((f) => [f.type, f.name.replace(/-\w{8}/, '-x')])).toEqual([
      ['trace', 'trace-x.zip'],
      ['attachment', 'page-1.yml'],
    ]);
  });

  it('makes a zip a trace only when it holds trace.trace', async () => {
    const zip = async (name: string, entry: string) => {
      const archive = Archiver('zip');
      const out = fs.createWriteStream(path.join(dir, name));
      archive.pipe(out);
      archive.append('x', { name: entry });
      await archive.finalize();
      await new Promise((resolve) => out.on('close', resolve));
      return path.join(dir, name);
    };
    const { files, cleanup } = await collectFiles(
      [await zip('logs.zip', 'docker.log'), await zip('t.zip', 'trace.trace')],
      { allowedTypes: ALLOWED_TYPES.attempt }
    );
    await cleanup();
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['logs.zip', 'attachment'],
      ['t.zip', 'trace'],
    ]);
  });

  it('refuses an empty file', async () => {
    await fs.outputFile(path.join(dir, 'empty.log'), '');
    await expect(
      collectFiles([path.join(dir, 'empty.log')], {
        allowedTypes: ALLOWED_TYPES.attempt,
      })
    ).rejects.toThrow(/empty/);
  });

  it('fails on a missing path', async () => {
    await expect(
      collectFiles([path.join(dir, 'nope')], {
        allowedTypes: ALLOWED_TYPES.attempt,
      })
    ).rejects.toThrow(/does not exist/);
  });

  it('merges network files in name order', async () => {
    await fs.outputFile(path.join(dir, 'trace-2.network'), '{"n":2}');
    await fs.outputFile(path.join(dir, 'trace-1.network'), '{"n":1}');
    expect(await mergeNetworkFiles(dir)).toBe('{"n":1}\n{"n":2}');
  });
});

describe('getFileLevel', () => {
  it('follows the target the way the API resolves it on a CI run', () => {
    expect(getFileLevel({})).toBe('run');
    expect(getFileLevel({ spec: 's' })).toBe('instance');
    expect(getFileLevel({ instanceId: 'i' })).toBe('instance');
    expect(getFileLevel({ spec: 's', testTitle: 't' })).toBe('test');
    expect(getFileLevel({ spec: 's', testTitle: 't', attempt: 0 })).toBe(
      'attempt'
    );
  });

  it('takes a screenshot at an instance but not at a test', () => {
    expect(ALLOWED_TYPES.instance).toContain('screenshot');
    expect(ALLOWED_TYPES.test).toEqual(['attachment']);
    expect(ALLOWED_TYPES.instance).not.toContain('trace');
  });
});

describe('attachFiles', () => {
  it('refuses to send a request without an API key or a record key', async () => {
    await expect(
      attachFiles({ credentials: {}, owner: { sessionId: 's' }, paths: [] })
    ).rejects.toThrow('Pass an API key or a record key');
  });
});

describe('chunkFiles', () => {
  const file = (sizeBytes: number) =>
    ({
      sizeBytes,
      name: 'f',
      path: 'f',
      type: 'attachment',
      contentType: 'x',
    }) as never;

  it('splits by count and by bytes', () => {
    const files = Array.from({ length: 5 }, () => file(10));
    expect(
      chunkFiles(files, { count: 2, bytes: 1000 }).map((c) => c.length)
    ).toEqual([2, 2, 1]);
    expect(
      chunkFiles(files, { count: 50, bytes: 25 }).map((c) => c.length)
    ).toEqual([2, 2, 1]);
    expect(chunkFiles([file(500)], { count: 50, bytes: 100 })).toHaveLength(1);
  });

  it('declares no more than a slow runner uploads before the URLs expire', () => {
    const tenMinutesAt256KiBs = 10 * 60 * 256 * 1024;
    expect(MAX_BYTES_PER_REQUEST).toBeLessThan(tenMinutesAt256KiBs);
    const files = [file(60 * 1024 ** 2), file(60 * 1024 ** 2)];
    expect(chunkFiles(files).map((c) => c.length)).toEqual([1, 1]);
  });
});

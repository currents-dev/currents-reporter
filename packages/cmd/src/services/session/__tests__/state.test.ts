import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSessionState, saveSessionState } from '../state';

describe('session state file', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-state-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is JSON indented by 2 spaces with a final newline', async () => {
    await saveSessionState({ sessionId: 's1', projectId: 'p1' });
    expect(
      fs.readFileSync(path.join(dir, '.currents-session/session.json'), 'utf8')
    ).toBe('{\n  "sessionId": "s1",\n  "projectId": "p1"\n}\n');
    expect(await readSessionState()).toEqual({
      sessionId: 's1',
      projectId: 'p1',
    });
  });

  it('names the file in a parse error', async () => {
    fs.mkdirSync(path.join(dir, '.currents-session'));
    fs.writeFileSync(path.join(dir, '.currents-session/session.json'), '{');
    await expect(readSessionState()).rejects.toThrow(/session\.json: /);
  });
});

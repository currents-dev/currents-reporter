import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveReportOptions } from '../fs';

describe('resolveReportOptions', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), 'report-dir-')));
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(cwd);
  });

  it('says where it looked when there is no .currents folder', async () => {
    await expect(resolveReportOptions()).rejects.toThrow(
      `No reports found: there is no report folder in "${join(cwd, '.currents')}"`
    );
  });

  it('says where it looked when .currents holds no folder', async () => {
    fs.outputFileSync(join(cwd, '.currents/file.txt'), '');

    await expect(resolveReportOptions()).rejects.toThrow(
      'Run the tests with a Currents reporter first, or pass --report-dir'
    );
  });

  it('fails when --report-dir does not exist', async () => {
    await expect(
      resolveReportOptions({ reportDir: join(cwd, 'missing') })
    ).rejects.toThrow(`the folder "${join(cwd, 'missing')}" does not exist`);
  });

  it('uses the newest folder in .currents', async () => {
    fs.ensureDirSync(join(cwd, '.currents/a'));

    expect(await resolveReportOptions()).toEqual({
      reportDir: join(cwd, '.currents/a'),
      configFilePath: join(cwd, '.currents/a/config.json'),
    });
  });
});

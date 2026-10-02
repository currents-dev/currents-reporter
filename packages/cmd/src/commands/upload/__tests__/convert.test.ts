import fs from 'fs-extra';
import os from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProgram } from '../../../bin/program';
import { getCurrentsConfig } from '../../../config/upload';
import { handleCurrentsReport } from '../../../services';

vi.mock('../../../services', () => ({
  handleCurrentsReport: vi.fn(),
}));

const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Shop API" tests="1" time="0.1">
  <testsuite name="List products" id="0" timestamp="2025-01-11T09:30:00.000Z" tests="1" failures="0" errors="0" skipped="0" time="0.1">
    <testcase name="Status code is 200" time="0.1" classname="Shop API"></testcase>
  </testsuite>
</testsuites>
`;

describe('currents run upload --input-format', () => {
  let workDir: string;
  let cwd: string;
  let stderr: string;
  let reportDirAtUpload: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CURRENTS_')) vi.stubEnv(key, undefined);
    }
    stderr = '';
    vi.spyOn(console, 'error').mockImplementation((...messages) => {
      stderr += messages.join(' ') + '\n';
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    workDir = await fs.realpath(
      await fs.mkdtemp(join(os.tmpdir(), 'currents-run-upload-'))
    );
    await fs.outputFile(join(workDir, 'reports/a.xml'), junit);
    await fs.outputFile(join(workDir, 'reports/b.xml'), junit);
    cwd = process.cwd();
    process.chdir(workDir);
    reportDirAtUpload = undefined;
    vi.mocked(handleCurrentsReport).mockImplementation(async () => {
      reportDirAtUpload = getCurrentsConfig()?.reportDir;
    });
  });

  afterEach(async () => {
    process.chdir(cwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.remove(workDir);
  });

  const upload = (...options: string[]) =>
    getProgram().parseAsync(
      [
        'run',
        'upload',
        '--key',
        'k',
        '--project-id',
        'p',
        '--ci-build-id',
        'b',
        '--input-format',
        'junit',
        '--input-file',
        'reports/*.xml',
        '--framework',
        'postman',
        ...options,
      ],
      { from: 'user' }
    );

  it('converts the reports to --output-dir, then uploads that folder', async () => {
    await upload('--output-dir', 'out');

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(handleCurrentsReport).toHaveBeenCalledTimes(1);
    expect(resolve(reportDirAtUpload!)).toBe(join(workDir, 'out'));
    expect(await fs.readdir(join(workDir, 'out'))).toEqual(
      expect.arrayContaining(['config.json', 'fullTestSuite.json', 'instances'])
    );
  });

  it('converts the reports to a new folder in .currents without --output-dir', async () => {
    await upload();

    expect(process.exit).toHaveBeenCalledWith(0);
    const [folder] = await fs.readdir(join(workDir, '.currents'));
    expect(reportDirAtUpload).toBe(join(workDir, '.currents', folder));
    expect(
      await fs.pathExists(join(reportDirAtUpload!, 'fullTestSuite.json'))
    ).toBe(true);
  });

  it('saves the converted reports to --report-dir when --output-dir is absent', async () => {
    await upload('--report-dir', 'out');

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(resolve(reportDirAtUpload!)).toBe(join(workDir, 'out'));
  });

  it.each(['--output-dir', '--report-dir'])(
    'fails without uploading when %s is not empty',
    async (option) => {
      await fs.outputFile(join(workDir, 'out/instances/old.json'), '{}');

      await upload(option, 'out');

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(stderr).toContain('The folder "out" is not empty');
      expect(handleCurrentsReport).not.toHaveBeenCalled();
      expect(await fs.readdir(join(workDir, 'out/instances'))).toEqual([
        'old.json',
      ]);
    }
  );

  it('converts into an empty --output-dir', async () => {
    await fs.ensureDir(join(workDir, 'out'));

    await upload('--output-dir', 'out');

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(handleCurrentsReport).toHaveBeenCalledTimes(1);
  });

  it('fails without converting when --output-dir and --report-dir differ', async () => {
    await upload('--output-dir', 'out', '--report-dir', 'other');

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr).toContain('--output-dir and --report-dir name different');
    expect(handleCurrentsReport).not.toHaveBeenCalled();
    expect(await fs.pathExists(join(workDir, 'out'))).toBe(false);
  });

  it('fails without uploading when --framework is missing', async () => {
    await getProgram().parseAsync(
      [
        'run',
        'upload',
        '--key',
        'k',
        '--project-id',
        'p',
        '--input-format',
        'junit',
        '--input-file',
        'reports/*.xml',
      ],
      { from: 'user' }
    );

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(handleCurrentsReport).not.toHaveBeenCalled();
  });

  it('uploads without converting when --input-format is absent', async () => {
    await getProgram().parseAsync(
      ['run', 'upload', '--key', 'k', '--project-id', 'p', '--report-dir', 'r'],
      { from: 'user' }
    );

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(reportDirAtUpload).toBe('r');
    expect(await fs.pathExists(join(workDir, '.currents'))).toBe(false);
  });
});

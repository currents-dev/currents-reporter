import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Reads the build, like the upload tests: run `npm run build` first.
const packageFolder = path.resolve(__dirname, '../../..');
const skillFolder = path.resolve(packageFolder, '../../skills/currents-cli');

function markdownFiles(folder: string) {
  return fs
    .readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'));
}

describe('the built package', () => {
  const [pack] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: packageFolder,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  ) as [{ files: { path: string }[] }];
  const packed = pack.files.map((f) => f.path);

  it('contains the skill files', () => {
    for (const file of markdownFiles(skillFolder)) {
      expect(packed).toContain(`dist/skills/currents-cli/${file}`);
      expect(
        fs.readFileSync(
          path.join(packageFolder, 'dist/skills/currents-cli', file),
          'utf8'
        )
      ).toBe(fs.readFileSync(path.join(skillFolder, file), 'utf8'));
    }
  });

  it('contains the guides', () => {
    const guides = markdownFiles(path.join(packageFolder, 'docs'));
    expect(guides.length).toBeGreaterThan(0);
    for (const file of guides) {
      expect(packed).toContain(`docs/${file}`);
    }
  });
});

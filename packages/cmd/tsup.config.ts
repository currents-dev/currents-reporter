import fs from 'fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/bin/index.ts',
    'src/services/upload/discovery/jest/reporter.ts',
  ],
  esbuildOptions: (options) => {
    options.legalComments = 'linked';
  },
  splitting: false,
  shims: true,
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'esnext',
  // `currents skill` reads the skill from dist/skills. The repository keeps the
  // only copy in skills/ at its root, where `npx skills add` finds it.
  onSuccess: async () => {
    fs.cpSync('../../skills', 'dist/skills', { recursive: true });
  },
});

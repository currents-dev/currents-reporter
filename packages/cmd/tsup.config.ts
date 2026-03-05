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
});

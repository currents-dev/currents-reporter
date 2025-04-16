import { defineConfig } from 'tsup';

export default defineConfig({
  target: 'node18',
  entry: ['src/index.ts'],
  esbuildOptions: (options) => {
    options.legalComments = 'linked';
  },
  clean: true,
  minify: true,
  dts: true,
  format: ['esm'],
  external: ['xmlbuilder2'],
});

import { defineConfig } from 'tsup';

export default defineConfig({
  target: 'node18',
  entry: ['src/index.js'],
  esbuildOptions: (options) => {
    options.legalComments = 'linked';
  },
  minify: true,
  dts: true,
  format: ['esm'],
  external: ['xmlbuilder2'],
});
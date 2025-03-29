import {defineConfig} from 'vite';
import {resolve} from 'path';
const prefix = `monaco-editor/esm/vs`;

const isDebug = process.env.NODE_ENV === 'debug';
const bundle = process.env.BUNDLE;

const PROSEMIRROR_BUNDLE = resolve(
  __dirname,
  'src/dyad_app/web_components/prosemirror_bundle.ts',
);

const input = [];
if (!bundle) {
  input.push(
    resolve(__dirname, 'src/dyad_app/web_components/index.ts'),
    PROSEMIRROR_BUNDLE,
  );
}
if (bundle === 'prosemirror') {
  input.push(PROSEMIRROR_BUNDLE);
}

export default defineConfig({
  base: '/static/build/',
  build: {
    target: 'modules',
    minify: false,
    sourcemap: isDebug,
    reportCompressedSize: false,

    // lib: {
    //   entry: resolve(__dirname, 'src/dyad_app/web_components/index.ts'),
    //   formats: ['es'],
    //   fileName: 'index',
    // },
    // sourcemap: 'inline',
    outDir: 'src/dyad_app/static/build',
    rollupOptions: {
      input,
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        manualChunks: {
          // Split vendor modules into separate chunks to make
          // build faster (and hopefully lazy load later)
          'vendor': ['monaco-editor'],
        },
      },
    },
    emptyOutDir: !bundle,
  },
  plugins: [],
  resolve: {
    browser: true,
  },
});

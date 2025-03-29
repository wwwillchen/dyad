const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

export default {
  mode: process.env.NODE_ENV == 'development' ? 'development' : 'production',
  source: {
    entry: {
      index: './src/dyad_app/web_components/index.ts',
      'viewer_bundle': './src/dyad_app/web_components/viewer_bundle.ts',
    },
    decorators: {
      version: 'legacy',
    },
  },
  output: {
    globalObject: 'self',
    filename: {
      js: '[name].js',
      css: '[name].css',
    },
    distPath: {root: './src/dyad_app/static/build', js: '', font: 'css/font'},
  },
  performance: {chunkSplit: {strategy: 'all-in-one'}},
  tools: {
    rspack: {
      plugins: [new MonacoWebpackPlugin()],
      output: {
        asyncChunks: false,
        publicPath: '/static/build/',
      },
    },
  },
};

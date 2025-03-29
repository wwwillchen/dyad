import * as monaco from 'monaco-editor';
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  jsx: monaco.languages.typescript.JsxEmit.React, // Enable JSX
});
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  // Too noisy because we don't have the full TS environment.
  noSemanticValidation: true,
});
export {monaco};

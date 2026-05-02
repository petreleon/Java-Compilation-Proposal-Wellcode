self.onmessage = function (e) {
  const { jsContent, wasmContent, stdinSAB } = e.data;

  // Set on self directly — Emscripten EM_JS accesses self (Worker global scope)
  self.teavm_stdin_sab = stdinSAB;

  const wasmBinary = new Uint8Array(
    atob(wasmContent)
      .split('')
      .map((c) => c.charCodeAt(0))
  );

  const jsText = atob(jsContent);

  self.Module = {
    wasmBinary,
    print: (text) => {
      self.postMessage({ type: 'stdout_line', text: String(text ?? '') });
    },
    printErr: (text) => {
      self.postMessage({ type: 'stderr_line', text: String(text ?? '') });
    },
    onRuntimeInitialized: () => {
      self.postMessage({ type: 'status', text: 'Running' });
    },
    onExit: (code) => {
      self.postMessage({ type: 'exit', code });
    },
  };

  try {
    const blob = new Blob([jsText], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    importScripts(url);
    URL.revokeObjectURL(url);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};

self.onerror = function (e) {
  self.postMessage({ type: 'error', message: 'Unhandled worker error: ' + e.message });
};

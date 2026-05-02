'use client';

import type { BrowserJob } from '@/lib/types';

export interface StdinController {
  push(text: string): void;
}

export interface WorkerCallbacks {
  onStatus(status: string): void;
  onStdout(text: string): void;
  onStderr(text: string): void;
  onShowInput(): void;
  onExit(code: number): void;
  onError(message: string): void;
}

export function bootTeaVMWorker(
  job: BrowserJob,
  callbacks: WorkerCallbacks
): Promise<StdinController> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/worker.js');

    // SharedArrayBuffer layout:
    // bytes 0-3: read position (Int32Array index 0)
    // bytes 4-7: write length (Int32Array index 1)
    // bytes 8..: circular byte buffer (Int8Array, size = SAB_SIZE - HEADER)
    const HEADER = 8;
    const SAB_SIZE = 4104; // 8 + 4096
    const sab = new SharedArrayBuffer(SAB_SIZE);
    const posArr = new Int32Array(sab, 0, 1);
    const lenArr = new Int32Array(sab, 4, 1);
    const bufArr = new Int8Array(sab, HEADER);
    const BUFFER_SIZE = bufArr.length;

    worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'status':
          callbacks.onStatus(msg.text);
          if (msg.text === 'Running') {
            callbacks.onShowInput();
          }
          break;
        case 'stdout_line':
          callbacks.onStdout(msg.text + '\n');
          break;
        case 'stderr_line':
          callbacks.onStderr(msg.text + '\n');
          break;
        case 'exit':
          callbacks.onExit(msg.code ?? 0);
          worker.terminate();
          break;
        case 'error':
          callbacks.onError(msg.message);
          worker.terminate();
          break;
      }
    };

    worker.onerror = (err) => {
      callbacks.onError(String(err));
      worker.terminate();
    };

    worker.postMessage({
      jsContent: job.jsContent,
      wasmContent: job.wasmContent,
      stdinSAB: sab,
    });

    const ctrl: StdinController = {
      push(text: string) {
        const data = new TextEncoder().encode(text + '\n');
        // Write bytes into circular buffer with atomic coordination
        let writePos = Atomics.load(lenArr, 0);
        for (let i = 0; i < data.length; i++) {
          const idx = (writePos + i) % BUFFER_SIZE;
          bufArr[idx] = data[i];
        }
        Atomics.store(lenArr, 0, writePos + data.length);
        Atomics.notify(lenArr, 0, 1);
      },
    };

    resolve(ctrl);
  });
}

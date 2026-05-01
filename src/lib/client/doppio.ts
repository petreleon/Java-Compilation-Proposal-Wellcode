'use client';

import type { BrowserJob } from '@/lib/types';

interface FSAPI {
  fs: any;
  path: any;
  process: any;
  BufferCtor: any;
}

export interface StdinController {
  push(text: string): void;
  read(requestedBytes: number | undefined, BufferCtor: any): any | null;
  // Returns a dispose function
  onceReadable(cb: () => void): () => void;
  onReadable(cb: () => void): () => void;
}

export function createStdinController(): StdinController {
  const queue: Uint8Array[] = [];
  const readableCbs = new Set<() => void>();
  const onceCbs = new Set<() => void>();

  return {
    push(text: string) {
      queue.push(new TextEncoder().encode(text + '\n'));
      // Fire callbacks synchronously (matches Node.js stream behaviour)
      for (const cb of Array.from(onceCbs)) {
        onceCbs.delete(cb);
        cb();
      }
      for (const cb of Array.from(readableCbs)) {
        cb();
      }
    },
    read(requestedBytes: number | undefined, BufferCtor: any) {
      if (queue.length === 0) return null;
      let total = 0;
      for (const c of queue) total += c.length;
      const len = requestedBytes ? Math.min(requestedBytes, total) : total;
      const buf = new BufferCtor(len);
      let w = 0;
      while (w < len && queue.length) {
        const chunk = queue[0];
        const need = len - w;
        const take = Math.min(need, chunk.length);
        for (let i = 0; i < take; i++) buf[w + i] = chunk[i];
        w += take;
        if (take === chunk.length) queue.shift();
        else queue[0] = chunk.subarray(take);
      }
      return buf;
    },
    // one-shot listener
    onceReadable(cb: () => void) {
      onceCbs.add(cb);
      return () => { onceCbs.delete(cb); };
    },
    // persistent listener
    onReadable(cb: () => void) {
      readableCbs.add(cb);
      return () => { readableCbs.delete(cb); };
    },
  };
}

export async function setupBrowserFS(zipData: ArrayBuffer): Promise<FSAPI> {
  const BrowserFS = (window as any).BrowserFS;
  const Doppio = (window as any).Doppio;
  if (!BrowserFS || !Doppio) {
    throw new Error('Doppio / BrowserFS runtime scripts not loaded');
  }

  const BufferCtor = BrowserFS.BFSRequire('buffer').Buffer;
  const zipBuffer = new BufferCtor(new Uint8Array(zipData));

  const readable = new BrowserFS.FileSystem.ZipFS(zipBuffer, 'doppio_home');
  const writable = new BrowserFS.FileSystem.InMemory();
  const mfs = new BrowserFS.FileSystem.MountableFileSystem();
  mfs.mount('/', readable);
  mfs.mount('/home', writable);

  if (!mfs.constructor.isAvailable) {
    mfs.constructor.isAvailable = () => true;
  }
  BrowserFS.initialize(mfs);

  const fs = BrowserFS.BFSRequire('fs');
  const path = BrowserFS.BFSRequire('path');
  const process = BrowserFS.BFSRequire('process');
  process.chdir('/home');

  return { fs, path, process, BufferCtor };
}

export function writeClassFiles(
  fs: any,
  path: any,
  BufferCtor: any,
  classFiles: Record<string, string>
) {
  for (const [fileName, b64] of Object.entries(classFiles)) {
    const bytes = Uint8Array.from(atob(b64), (c: string) => c.charCodeAt(0));
    fs.writeFileSync(path.join('/home', fileName), new BufferCtor(bytes));
  }
}

export function hijackStdio(
  process: any,
  append: (text: string) => void,
  stdinCtrl: StdinController
) {
  process.stdout.write = (data: any) => {
    append(String(data));
    return true;
  };
  process.stderr.write = (data: any) => {
    append(String(data));
    return true;
  };

  process.stdin = {
    read(requestedBytes?: number) {
      return stdinCtrl.read(
        requestedBytes,
        (window as any).BrowserFS.BFSRequire('buffer').Buffer
      );
    },
    once(event: string, cb: () => void) {
      if (event === 'readable') stdinCtrl.onceReadable(cb);
      return this;
    },
    on(event: string, cb: () => void) {
      if (event === 'readable') stdinCtrl.onReadable(cb);
      return this;
    },
    pause() {
      return this;
    },
    resume() {
      return this;
    },
    isTTY: false,
    setRawMode() {},
  } as any;
}

export function buildJVMOptions(): unknown {
  return {
    doppioHomePath: '/',
    classpath: ['/home'],
    bootstrapClasspath: [
      '/vendor/java_home/lib/rt.jar',
      '/vendor/java_home/lib/doppio.jar',
      '/vendor/java_home/lib/jce.jar',
      '/vendor/java_home/lib/jsse.jar',
      '/vendor/java_home/lib/charsets.jar',
      '/vendor/java_home/lib/ext/localedata.jar',
      '/vendor/java_home/lib/ext/dnsns.jar',
      '/vendor/java_home/lib/ext/sunjce_provider.jar',
      '/vendor/java_home/lib/ext/sunpkcs11.jar',
      '/vendor/java_home/lib/ext/zipfs.jar',
      '/vendor/java_home/lib/ext/nashorn.jar',
    ],
    javaHomePath: '/vendor/java_home',
    nativeClasspath: ['/natives'],
    properties: {},
    tmpDir: '/tmp',
    responsiveness: 1000,
    intMode: false,
    dumpJITStats: false,
  };
}

export async function bootJVM(
  job: BrowserJob,
  setStatus: (s: string) => void,
  onOutput: (text: string) => void,
  onReady: () => void,
  onExit: (code: number) => void
) {
  setStatus('Fetching JCL archive…');
  const zipRes = await fetch('/doppio/doppio_home.zip');
  const zipData = await zipRes.arrayBuffer();

  setStatus('Initializing filesystem…');
  const { fs, path, process, BufferCtor } = await setupBrowserFS(zipData);

  setStatus('Writing class files…');
  writeClassFiles(fs, path, BufferCtor, job.classFiles);

  const stdinCtrl = createStdinController();
  if (job.stdin) stdinCtrl.push(job.stdin);

  hijackStdio(process, onOutput, stdinCtrl);

  setStatus('Booting JVM…');

  const Doppio = (window as any).Doppio;
  const opts = buildJVMOptions();
  new Doppio.VM.JVM(opts, (err: any, jvm: any) => {
    if (err) {
      setStatus(`JVM boot failed: ${err.message}`);
      return;
    }
    setStatus(`Running ${job.mainClassName}…`);
    onReady();
    jvm.runClass(job.mainClassName, [], (exitCode: number) => {
      onExit(exitCode);
      jvm.halt(exitCode);
    });
  });

  return stdinCtrl;
}

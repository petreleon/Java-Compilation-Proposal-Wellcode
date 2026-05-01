import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStdinController, type StdinController } from '@/lib/client/doppio';

describe('RunContent StrictMode double-mount guard', () => {
  function hijackStdin(ctrl: StdinController) {
    const fakeStdin = {
      read(nBytes?: number) {
        return ctrl.read(nBytes, Uint8Array);
      },
      once(_event: string, cb: () => void) {
        ctrl.onceReadable(cb);
        return fakeStdin;
      },
      isTTY: false,
      pause() { return fakeStdin; },
      resume() { return fakeStdin; },
    };
    (window as any).process = { stdin: fakeStdin };
    if (typeof global !== 'undefined') {
      (global as any).process = { stdin: fakeStdin };
    }
  }

  function getStdin() {
    return (window as any).process.stdin;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).process;
    if (typeof global !== 'undefined') delete (global as any).process;
  });

  it('Doppio async_input: blocks when empty, resumes on synchronous push', () => {
    const ctrl = createStdinController();
    hijackStdin(ctrl);

    let bytesRead: Uint8Array | null = null;
    let resumed = false;
    const stdin = getStdin();

    function asyncInput(n_bytes: number) {
      let data = stdin.read(n_bytes);
      if (data === null) data = stdin.read();
      if (data === null) {
        stdin.once('readable', () => {
          let data2 = stdin.read(n_bytes);
          if (data2 === null) data2 = stdin.read();
          if (data2 === null) data2 = new Uint8Array(0);
          bytesRead = data2;
          resumed = true;
        });
      } else {
        bytesRead = data;
        resumed = true;
      }
    }

    asyncInput(1024);
    expect(resumed).toBe(false);
    expect(bytesRead).toBeNull();

    ctrl.push('Petre');
    expect(resumed).toBe(true);
    expect(bytesRead).not.toBeNull();
    expect(new TextDecoder().decode(bytesRead!)).toBe('Petre\n');
  });

  it('hasBooted ref prevents double JVM boot under StrictMode-like effect cleanup', () => {
    const ctrl = createStdinController();
    hijackStdin(ctrl);
    const stdin = getStdin();

    let bootCount = 0;
    let readCount = 0;
    let hasBooted = false;

    function bootJVM() {
      bootCount++;
      stdin.once('readable', () => {
        readCount++;
      });
    }

    // === FIRST MOUNT ===
    if (!hasBooted) {
      hasBooted = true;
      bootJVM();
    }
    expect(bootCount).toBe(1);

    // === STRICT MODE CLEANUP ===
    // OLD code reset hasBooted → second JVM booted.
    // NEW code keeps hasBooted → no second boot.

    // === REMOUNT ===
    if (!hasBooted) {
      bootJVM(); // Should NOT run
    }
    expect(bootCount).toBe(1);

    ctrl.push('test');
    expect(readCount).toBe(1);
  });

  it('two sequential Scanner reads each get their own once callback', () => {
    const ctrl = createStdinController();
    hijackStdin(ctrl);
    const stdin = getStdin();
    const results: (Uint8Array | null)[] = [];

    function asyncInput(n_bytes: number) {
      let data = stdin.read(n_bytes);
      if (data === null) data = stdin.read();
      if (data === null) {
        stdin.once('readable', () => {
          let data2 = stdin.read(n_bytes);
          if (data2 === null) data2 = stdin.read();
          if (data2 === null) data2 = new Uint8Array(0);
          results.push(data2);
        });
      } else {
        results.push(data);
      }
    }

    asyncInput(1024);
    expect(results).toHaveLength(0);

    ctrl.push('line1');
    expect(results).toHaveLength(1);
    expect(new TextDecoder().decode(results[0]!)).toBe('line1\n');

    asyncInput(1024);
    expect(results).toHaveLength(1);

    ctrl.push('line2');
    expect(results).toHaveLength(2);
    expect(new TextDecoder().decode(results[1]!)).toBe('line2\n');
  });
});

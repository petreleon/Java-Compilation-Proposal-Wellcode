import { describe, it, expect } from 'vitest';
import { createStdinController } from './doppio';

describe('StdinController', () => {
  const fakeBuffer = Uint8Array;

  it('returns null when queue is empty', () => {
    const ctrl = createStdinController();
    expect(ctrl.read(10, fakeBuffer)).toBeNull();
  });

  it('reads pushed text with newline', () => {
    const ctrl = createStdinController();
    ctrl.push('hello');
    const buf = ctrl.read(undefined, fakeBuffer) as Uint8Array;
    expect(buf).not.toBeNull();
    const str = new TextDecoder().decode(buf);
    expect(str).toBe('hello\n');
  });

  it('reads partial bytes when requestedBytes is smaller than total', () => {
    const ctrl = createStdinController();
    ctrl.push('ab');
    const buf = ctrl.read(2, fakeBuffer) as Uint8Array;
    expect(buf.length).toBe(2);
    expect(new TextDecoder().decode(buf)).toBe('ab');
    const rest = ctrl.read(undefined, fakeBuffer) as Uint8Array;
    expect(new TextDecoder().decode(rest)).toBe('\n');
  });

  it('fires onReadable callback synchronously when new data arrives', () => {
    const ctrl = createStdinController();
    let called = 0;
    ctrl.onReadable(() => {
      called += 1;
    });
    ctrl.push('test');
    expect(called).toBe(1);
    ctrl.push('again');
    expect(called).toBe(2);
  });

  it('supports multiple pushes', () => {
    const ctrl = createStdinController();
    ctrl.push('line1');
    ctrl.push('line2');
    const first = ctrl.read(undefined, fakeBuffer) as Uint8Array;
    expect(new TextDecoder().decode(first)).toBe('line1\nline2\n');
  });

  it('splits chunks correctly when reading across push boundaries', () => {
    const ctrl = createStdinController();
    ctrl.push('abc');
    const buf1 = ctrl.read(3, fakeBuffer) as Uint8Array;
    expect(new TextDecoder().decode(buf1)).toBe('abc');
    const buf2 = ctrl.read(undefined, fakeBuffer) as Uint8Array;
    expect(new TextDecoder().decode(buf2)).toBe('\n');
  });

  /**
   * This is the exact pattern DoppioJVM uses for System.in reads.
   * It calls "once('readable', ...)", reads from the queue in the
   * callback, and passes the result to a "resume" function.
   */
  it('simulates Doppio async_input with Scanner: blocks then resumes on push', () => {
    const ctrl = createStdinController();
    let readableCallback: (() => void) | null = null;

    const fakeStdin = {
      read(nBytes?: number) {
        return ctrl.read(nBytes, fakeBuffer);
      },
      once(event: string, cb: () => void) {
        if (event === 'readable') ctrl.onceReadable(cb);
        return fakeStdin;
      },
      isTTY: false,
    };

    // Simulate Doppio's async_input(1024, resume) call:
    let bytesRead: Uint8Array | null = null;
    let resumed = false;

    const readInput = () => {
      let data = fakeStdin.read(1024);
      if (data === null) {
        data = fakeStdin.read();
      }
      if (data === null) {
        // Block, register once('readable')
        fakeStdin.once('readable', () => {
          let data2 = fakeStdin.read(1024);
          if (data2 === null) data2 = fakeStdin.read();
          if (data2 === null) data2 = new Uint8Array(0);
          bytesRead = data2;
          resumed = true;
        });
      } else {
        bytesRead = data;
        resumed = true;
      }
    };

    // 1. Scanner asks for input — queue is empty → blocks
    readInput();
    expect(resumed).toBe(false);
    expect(bytesRead).toBeNull();

    // 2. User "types" and clicks Send → synchronous push
    ctrl.push('Petre');

    // 3. The 'readable' callback should have fired synchronously
    expect(resumed).toBe(true);
    expect(bytesRead).not.toBeNull();
    expect(new TextDecoder().decode(bytesRead!)).toBe('Petre\n');
  });

  /**
   * Scanner calls readBytes multiple times. The first call fills a buffer;
   * after the program prints again, a second scan might trigger a SECOND
   * once('readable') registration. That must also work after a new push.
   */
  it('supports a second read after a second push', () => {
    const ctrl = createStdinController();
    let readableCallback: (() => void) | null = null;

    const fakeStdin = {
      read(nBytes?: number) {
        return ctrl.read(nBytes, fakeBuffer);
      },
      once(event: string, cb: () => void) {
        if (event === 'readable') ctrl.onceReadable(cb);
        return fakeStdin;
      },
      isTTY: false,
    };

    let result: Uint8Array | null = null;

    const waitForReadable = (n: number) => {
      fakeStdin.once('readable', () => {
        let data = fakeStdin.read(n);
        if (data === null) data = fakeStdin.read();
        if (data === null) data = new Uint8Array(0);
        result = data;
      });
    };

    // First scan
    waitForReadable(10);
    ctrl.push('line1');
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(result!)).toBe('line1\n');

    result = null;

    // Second scan (fresh once registration)
    waitForReadable(10);
    ctrl.push('line2');
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(result!)).toBe('line2\n');
  });
});

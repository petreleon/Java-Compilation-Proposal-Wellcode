import { describe, test, expect } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { compileJavaCodeToEmscriptenWASM, getTeaCP } from '@/lib/server/teavm-emscripten';

const COMPILE_TIMEOUT = 30_000;

async function compileAndGetArtifacts(javaCode: string) {
  const teaCP = await getTeaCP();
  const tempDir = `/tmp/javaweb-test-${randomUUID()}`;
  try {
    await compileJavaCodeToEmscriptenWASM(javaCode, 'Hello', tempDir, teaCP);
    const allC = await fs.readFile(`${tempDir}/teavm-out/all.c`, 'utf8');
    const logC = await fs.readFile(`${tempDir}/teavm-out/log.c`, 'utf8');

    const cisPath = `${tempDir}/teavm-out/classes/java/lang/ConsoleInputStream.c`;
    let consoleInputStreamC = '';
    try {
      consoleInputStreamC = await fs.readFile(cisPath, 'utf8');
    } catch { }

    const jsContent = await fs.readFile(`${tempDir}/runtime.js`, 'utf8');

    return { allC, logC, consoleInputStreamC, jsContent };
  } finally {
    await fs.rm(tempDir, { recursive: true }).catch(() => {});
  }
}

const STDIN_CODE = `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;

public class Hello {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String s = br.readLine();
        System.out.println("Echo: " + s);
    }
}`;

const NO_STDIN_CODE = `public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`;

describe('patchConsoleInputStream', () => {
  test('injects EM_JS teavm_js_getchar when program uses stdin', { timeout: COMPILE_TIMEOUT }, async () => {
    const { consoleInputStreamC } = await compileAndGetArtifacts(STDIN_CODE);
    expect(consoleInputStreamC).toContain('EM_JS(int, teavm_js_getchar');
    expect(consoleInputStreamC).toContain('teavm_stdin_sab');
  });

  test('does not create ConsoleInputStream.c when program does not use stdin', { timeout: COMPILE_TIMEOUT }, async () => {
    const { consoleInputStreamC } = await compileAndGetArtifacts(NO_STDIN_CODE);
    expect(consoleInputStreamC).toBe('');
  });

  test('read() polls teavm_js_getchar() with emscripten_sleep', { timeout: COMPILE_TIMEOUT }, async () => {
    const { consoleInputStreamC } = await compileAndGetArtifacts(STDIN_CODE);
    expect(consoleInputStreamC).toContain('int32_t meth_jl_ConsoleInputStream_read');
    expect(consoleInputStreamC).toContain('teavm_js_getchar');
    expect(consoleInputStreamC).toContain('emscripten_sleep');
    // Should NOT contain throwException in read() body
    const readBody = consoleInputStreamC.match(/int32_t meth_jl_ConsoleInputStream_read[^{]*\{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(readBody).not.toContain('throwException');
  });

  test('read_0() overrides array read to consume available bytes', { timeout: COMPILE_TIMEOUT }, async () => {
    const { consoleInputStreamC } = await compileAndGetArtifacts(STDIN_CODE);
    expect(consoleInputStreamC).toContain('meth_jl_ConsoleInputStream_read_0');
    expect(consoleInputStreamC).toContain('TEAVM_ARRAY_DATA');
    // Vtable points to the new array read
    expect(consoleInputStreamC).toContain('.virt_read_0 = &meth_jl_ConsoleInputStream_read_0');
  });

  test('all.c includes patched ConsoleInputStream.c via #include', { timeout: COMPILE_TIMEOUT }, async () => {
    const { allC } = await compileAndGetArtifacts(STDIN_CODE);
    expect(allC).toContain('#include "classes/java/lang/ConsoleInputStream.c"');
  });

  test('EM_JS function is present in compiled runtime.js', { timeout: COMPILE_TIMEOUT }, async () => {
    const { jsContent } = await compileAndGetArtifacts(STDIN_CODE);
    expect(jsContent).toContain('function teavm_js_getchar');
    expect(jsContent).toContain('teavm_stdin_sab');
  });

  test('EM_JS accesses SAB via self (Worker global scope)', { timeout: COMPILE_TIMEOUT }, async () => {
    const { jsContent } = await compileAndGetArtifacts(STDIN_CODE);
    expect(jsContent).toContain('self.teavm_stdin_sab');
  });

  test('uses emscripten_sleep in read() for blocking behavior', { timeout: COMPILE_TIMEOUT }, async () => {
    const { consoleInputStreamC } = await compileAndGetArtifacts(STDIN_CODE);
    expect(consoleInputStreamC).toContain('emscripten_sleep');
  });
});

describe('patchLogC (stdout capture)', () => {
  test('replaces teavm_logchar body with printf', { timeout: COMPILE_TIMEOUT }, async () => {
    const { logC } = await compileAndGetArtifacts(NO_STDIN_CODE);
    expect(logC).toContain('printf("%c"');
    expect(logC).toContain('#include <stdio.h>');
  });

  test('runtime.js routes printf to Module.print', { timeout: COMPILE_TIMEOUT }, async () => {
    const { jsContent } = await compileAndGetArtifacts(NO_STDIN_CODE);
    expect(jsContent).toContain('print');
  });
});

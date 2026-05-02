import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface EmscriptenCompileResult {
  success: boolean;
  jsContent?: string;
  wasmContent?: string;
  error?: string;
}

function execSpawn(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(env || {}) },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (data) => {
      stdout += String(data);
    });
    child.stderr?.on('data', (data) => {
      stderr += String(data);
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findFiles(full, pattern)));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function fixShadowHeaders(teaOutDir: string) {
  const renamed: Record<string, string> = {
    'time.h': 'teavm_time.h',
    'string.h': 'teavm_string.h',
    'date.h': 'teavm_date.h',
  };
  for (const [orig, renamedName] of Object.entries(renamed)) {
    const src = path.join(teaOutDir, orig);
    if (await fs.access(src).then(() => true).catch(() => false)) {
      await fs.rename(src, path.join(teaOutDir, renamedName));
    }
  }
  const files = await findFiles(teaOutDir, /\.(c|h)$/);
  for (const f of files) {
    let content = await fs.readFile(f, 'utf8');
    let modified = false;
    for (const [orig, renamedName] of Object.entries(renamed)) {
      // Match any relative path ending in the header name, e.g., ../../../time.h
      const re = new RegExp(`#include "(?:[^"]*/)*${orig.replace(/\./g, '\\\.')}"`, 'g');
      if (re.test(content)) {
        content = content.replace(re, `#include "${renamedName}"`);
        modified = true;
      }
    }
    if (modified) {
      await fs.writeFile(f, content, 'utf8');
    }
  }
}

async function patchConsoleInputStream(teaOutDir: string) {
  const consoleStreamPath = path.join(teaOutDir, 'classes', 'java', 'lang', 'ConsoleInputStream.c');
  if (!(await fs.access(consoleStreamPath).then(() => true).catch(() => false))) {
    return; // program doesn't use stdin
  }
  let content = await fs.readFile(consoleStreamPath, 'utf8');

  // Replace the read() function body
  const readRe = /int32_t meth_jl_ConsoleInputStream_read\(void\* teavm_this_\)[^{]*\{[\s\S]*?\n\}/;
  if (!readRe.test(content)) {
    console.warn('Could not find ConsoleInputStream_read to patch; stdin may not work');
    return;
  }

  // EM_JS: non-blocking one-shot read from SharedArrayBuffer.
  // Returns byte (0-255) or -1 if no data available.
  // Caller (C code) polls with emscripten_sleep for ASYNCIFY yield.
  const emJsBlock = `EM_JS(int, teavm_js_getchar, (), {
  if (typeof self !== 'undefined' && typeof self.teavm_stdin_sab !== 'undefined') {
    var pos = new Int32Array(self.teavm_stdin_sab, 0, 1);
    var len = new Int32Array(self.teavm_stdin_sab, 4, 1);
    var buf = new Int8Array(self.teavm_stdin_sab, 8);
    var p = Atomics.load(pos, 0);
    var l = Atomics.load(len, 0);
    if (p < l) {
      Atomics.store(pos, 0, p + 1);
      return buf[p];
    }
  }
  return -1;
});
  `;

  const newBody = `int32_t meth_jl_ConsoleInputStream_read(void* teavm_this_) {
    int32_t c;
    while (1) {
        c = teavm_js_getchar();
        if (c >= 0) return c;
        emscripten_sleep(1);
    }
}`;

  const newArrayReadBody = `int32_t meth_jl_ConsoleInputStream_read_0(void* teavm_this_, TeaVM_Array* teavm_local_1, int32_t teavm_local_2, int32_t teavm_local_3) {
    int32_t c;
    int32_t count = 0;
    while (count < teavm_local_3) {
        c = teavm_js_getchar();
        if (c >= 0) {
            int8_t* data = (int8_t*) TEAVM_ARRAY_DATA(teavm_local_1, int8_t);
            data[teavm_local_2 + count] = (int8_t) c;
            count++;
            continue;
        }
        if (count > 0) {
            return count;
        }
        emscripten_sleep(1);
    }
    return count;
}`;

  // Inject EM_JS helper BEFORE replacing function body
  if (!content.includes('teavm_js_getchar')) {
    content = content.replace(/void meth_jl_ConsoleInputStream__init_/, emJsBlock + 'void meth_jl_ConsoleInputStream__init_');
  }

  // Replace single-byte read() body
  content = content.replace(readRe, newBody);

  // Add array read() override after the single-byte read function
  if (!content.includes('meth_jl_ConsoleInputStream_read_0')) {
    const newFuncStart = content.indexOf(newBody);
    if (newFuncStart >= 0) {
      const newFuncEnd = newFuncStart + newBody.length;
      content = content.slice(0, newFuncEnd) + '\n' + newArrayReadBody + content.slice(newFuncEnd);
    }
  }

  // Update vtable to use the new array read
  content = content.replace(
    /\.virt_read_0 = &meth_ji_InputStream_read/,
    '.virt_read_0 = &meth_jl_ConsoleInputStream_read_0'
  );

  // Add function declaration to ConsoleInputStream.h
  const headerPath = path.join(teaOutDir, 'classes', 'java', 'lang', 'ConsoleInputStream.h');
  if (await fs.access(headerPath).then(() => true).catch(() => false)) {
    let header = await fs.readFile(headerPath, 'utf8');
    if (!header.includes('meth_jl_ConsoleInputStream_read_0')) {
      header = header.replace(
        /(extern int32_t meth_jl_ConsoleInputStream_read\(void\*\);)/,
        '$1\nextern int32_t meth_jl_ConsoleInputStream_read_0(void*, TeaVM_Array*, int32_t, int32_t);'
      );
      await fs.writeFile(headerPath, header, 'utf8');
    }
  }

  // Add #include <emscripten.h> near top if missing
  if (!content.includes('#include <emscripten.h>')) {
    content = '#include <emscripten.h>\n' + content;
  }

  await fs.writeFile(consoleStreamPath, content, 'utf8');

  // Also patch all.c which is the concatenated file that emcc actually compiles
  const allCPath = path.join(teaOutDir, 'all.c');
  if (await fs.access(allCPath).then(() => true).catch(() => false)) {
    let allC = await fs.readFile(allCPath, 'utf8');
    if (!allC.includes('teavm_js_getchar') && allC.includes('void meth_jl_ConsoleInputStream__init_')) {
      allC = allC.replace(/void meth_jl_ConsoleInputStream__init_/, emJsBlock + 'void meth_jl_ConsoleInputStream__init_');
    }
    if (allC.includes('int32_t meth_jl_ConsoleInputStream_read(void* teavm_this_)') && !allC.includes('emscripten_sleep')) {
      allC = allC.replace(readRe, newBody);
    }
    if (!allC.includes('meth_jl_ConsoleInputStream_read_0')) {
      const newFuncStart = allC.indexOf(newBody);
      if (newFuncStart >= 0) {
        const newFuncEnd = newFuncStart + newBody.length;
        allC = allC.slice(0, newFuncEnd) + '\n' + newArrayReadBody + allC.slice(newFuncEnd);
      }
    }
    allC = allC.replace(
      /(\.virt_read_0 = &meth_ji_InputStream_read)(?!\s*;\s*\/\/ overridden)/,
      '.virt_read_0 = &meth_jl_ConsoleInputStream_read_0'
    );
    await fs.writeFile(allCPath, allC, 'utf8');
  }
}

async function patchLogC(teaOutDir: string) {
  const logPath = path.join(teaOutDir, 'log.c');
  if (!(await fs.access(logPath).then(() => true).catch(() => false))) {
    return;
  }
  let content = await fs.readFile(logPath, 'utf8');

  const logcharIdx = content.indexOf('void teavm_logchar(int32_t c)');
  if (logcharIdx === -1) {
    console.warn('Could not find teavm_logchar to patch; stdout may not capture');
    return;
  }

  // Replace the body of teavm_logchar to use printf.
  // Emscripten routes printf to Module.print, which we
  // wire to worker postMessage. This works with both ASYNCIFY=0 and =1.
  let braceDepth = 0;
  let bodyEnd = -1;
  const bodyStart = content.indexOf('{', logcharIdx);
  for (let i = bodyStart; i < content.length; i++) {
    if (content[i] === '{') braceDepth++;
    else if (content[i] === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }
  if (bodyEnd === -1) return;

  const replacement = `{
    printf("%c", c);
    fflush(stdout);
  }`;

  content = content.slice(0, bodyStart) + replacement + content.slice(bodyEnd + 1);

  if (!content.includes('#include <stdio.h>')) {
    content = '#include <stdio.h>\n' + content;
  }

  await fs.writeFile(logPath, content, 'utf8');
}

export const ECJ_JAR = path.resolve(process.cwd(), 'vendor', 'ecj-3.42.0.jar');

function resolveEmsdkHome(): string | undefined {
  if (process.env.EMSDK) return process.env.EMSDK;
  const candidates = [
    path.join(process.env.HOME || '', 'code', 'emscripten', 'emsdk'),
    path.join(process.env.HOME || '', 'emsdk'),
    '/usr/local/emsdk',
    '/opt/emsdk',
    '/usr/lib/emsdk',
  ];
  for (const c of candidates) {
    const emcc = path.join(c, 'upstream', 'emscripten', 'emcc');
    try {
      if (require('fs').existsSync(emcc)) return c;
    } catch {}
  }
  return undefined;
}

export async function compileJavaCodeToEmscriptenWASM(
  javaCode: string,
  mainClassName: string,
  tempDir: string,
  teaCP?: string
): Promise<EmscriptenCompileResult> {
  if (!teaCP) {
    teaCP = await getTeaCP();
  }
  await fs.mkdir(tempDir, { recursive: true });

  const publicClassMatch = javaCode.match(/public\s+class\s+(\w+)/);
  const effectiveFileName = publicClassMatch
    ? `${publicClassMatch[1]}.java`
    : `${mainClassName}.java`;

  const srcPath = path.join(tempDir, effectiveFileName);
  await fs.writeFile(srcPath, javaCode, 'utf8');

  // Compile with ECJ
  const ecjRes = await execSpawn(
    'java',
    ['-jar', ECJ_JAR, '-d', tempDir, '-source', '11', '-target', '11', srcPath],
    tempDir
  );
  if (ecjRes.exitCode !== 0) {
    return { success: false, error: `ECJ failed: ${ecjRes.stderr}` };
  }

  // TeaVM C backend
  const teaOutDir = path.join(tempDir, 'teavm-out');
  await fs.mkdir(teaOutDir, { recursive: true });
  const teaRes = await execSpawn(
    'java',
    [
      '-cp', teaCP,
      'org.teavm.cli.TeaVMRunner',
      '-t', 'C',
      '-p', tempDir,
      '-d', teaOutDir,
      '-f', 'main.c',
      mainClassName,
    ],
    tempDir
  );
  if (teaRes.exitCode !== 0) {
    return { success: false, error: `TeaVM failed: ${teaRes.stderr}\n${teaRes.stdout}` };
  }

  const allCPath = path.join(teaOutDir, 'all.c');
  if (!(await fs.access(allCPath).then(() => true).catch(() => false))) {
    return { success: false, error: 'TeaVM did not generate all.c' };
  }

  // Fix shadow headers
  await fixShadowHeaders(teaOutDir);

  // Replace fiber.c with Emscripten-compatible version
  const customFiber = path.resolve(process.cwd(), 'vendor', 'fiber-emscripten.c');
  if (await fs.access(customFiber).then(() => true).catch(() => false)) {
    await fs.copyFile(customFiber, path.join(teaOutDir, 'fiber.c'));
  }

  // Detect if program uses stdin (ConsoleInputStream.c exists after TeaVM generation)
  const usesStdin = await fs.access(path.join(teaOutDir, 'classes', 'java', 'lang', 'ConsoleInputStream.c'))
    .then(() => true)
    .catch(() => false);

  if (usesStdin) {
    // Patch ConsoleInputStream to read from JS stdin queue instead of throwing EOF
    await patchConsoleInputStream(teaOutDir);
  }

  // Patch log.c to output via JS bridge instead of putwchar/printf
  await patchLogC(teaOutDir);

  // Build with Emscripten
  const emsdk = process.env.EMSDK || resolveEmsdkHome();
  if (!emsdk) {
    return {
      success: false,
      error: 'Emscripten SDK (EMSDK) not found. Please set EMSDK env var or install emsdk.',
    };
  }
  const emsdkNode = path.join(emsdk, 'node', '22.16.0_64bit', 'bin', 'node');
  const emEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${path.join(emsdk, 'upstream', 'emscripten')}:${process.env.PATH || ''}`,
    EMSDK: emsdk,
    EMSDK_NODE: emsdkNode,
    EMSDK_PYTHON: path.join(emsdk, 'python', '3.13.3_64bit', 'bin', 'python3'),
    SSL_CERT_FILE: path.join(
      emsdk,
      'python',
      '3.13.3_64bit',
      'lib',
      'python3.13',
      'site-packages',
      'certifi',
      'cacert.pem'
    ),
  };

  const emccPath = path.join(emsdk, 'upstream', 'emscripten', 'emcc');
  const emccFlags = [
    '-O2',
    allCPath,
    '-o',
    path.join(tempDir, 'runtime.js'),
    '-s',
    'WASM=1',
    '-s',
    'ENVIRONMENT=worker',
    '-s',
    'EXPORTED_FUNCTIONS=["_main"]',
    '-s',
    'EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]',
    '-s',
    'TOTAL_STACK=2097152',
    '-s',
    'TOTAL_MEMORY=33554432',
    '-s',
    'ALLOW_MEMORY_GROWTH=1',
    '-s',
    'NO_EXIT_RUNTIME=0',
    '-s',
    'FORCE_FILESYSTEM=1',
    `-I${teaOutDir}`,
    '-D_POSIX_C_SOURCE=200809L',
    '-D_DEFAULT_SOURCE',
    '-w',
    '-Wno-implicit-function-declaration',
  ];

  if (usesStdin) {
    emccFlags.push('-s', 'ASYNCIFY=1');
    emccFlags.push('-s', 'ASYNCIFY_STACK_SIZE=1048576');
  }

  const emccRes = await execSpawn(emccPath, emccFlags, tempDir, emEnv);
  if (emccRes.exitCode !== 0) {
    return { success: false, error: `emcc failed: ${emccRes.stderr}\n${emccRes.stdout}` };
  }

  const jsPath = path.join(tempDir, 'runtime.js');
  const wasmPath = path.join(tempDir, 'runtime.wasm');
  const [jsBuf, wasmBuf] = await Promise.all([fs.readFile(jsPath), fs.readFile(wasmPath)]);

  return {
    success: true,
    jsContent: Buffer.from(jsBuf).toString('base64'),
    wasmContent: Buffer.from(wasmBuf).toString('base64'),
  };
}

export async function getTeaCP(): Promise<string> {
  const TEA_CP_DIR = path.resolve(process.cwd(), 'vendor');
  const versions = ['0.12.3', '0.13.1', '0.13.0'];
  for (const v of versions) {
    const exists = (await findFiles(TEA_CP_DIR, new RegExp(`teavm-cli-${v}\\.jar$`))).length > 0;
    if (exists) {
      const jars = await findFiles(TEA_CP_DIR, new RegExp(`teavm.*${v}\\.jar$`));
      return jars.join(':');
    }
  }
  const allJars = await findFiles(TEA_CP_DIR, /^teavm.*\.jar$/);
  if (allJars.length === 0) {
    throw new Error('TeaVM jars not found in vendor/');
  }
  return allJars.join(':');
}

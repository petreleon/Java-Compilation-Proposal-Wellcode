import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { compileJavaCodeToEmscriptenWASM, getTeaCP } from '@/lib/server/teavm-emscripten';
import { runIOTests } from '@/lib/server/ioRunner';
import { IOTest } from '@/lib/types';

let cachedTeaCP: string | undefined;

export async function POST(request: NextRequest) {
  let tempDir = '';
  try {
    const form = await request.formData();
    const javaCode = form.get('javaCode') as string;
    const mainClassName = form.get('mainClassName') as string;
    const testsRaw = form.get('tests') as string;
    const tests: IOTest[] = JSON.parse(testsRaw || '[]');

    if (!javaCode || !mainClassName) {
      return NextResponse.json(
        { error: 'Missing javaCode or mainClassName' },
        { status: 400 }
      );
    }

    tempDir = `/tmp/javaweb-${randomUUID()}`;
    const { promises: fs } = await import('fs');
    await fs.mkdir(tempDir, { recursive: true });

    // Get TeaVM classpath (cached)
    if (!cachedTeaCP) {
      cachedTeaCP = await getTeaCP();
    }

    // Compile Java -> TeaVM C -> Emscripten WASM
    const compileRes = await compileJavaCodeToEmscriptenWASM(
      javaCode,
      mainClassName,
      tempDir,
      cachedTeaCP
    );
    if (!compileRes.success) {
      return NextResponse.json(
        { error: compileRes.error },
        { status: 400 }
      );
    }

    // Run I/O tests server-side using java directly (fast, no need for WASM)
    const testResults = await runIOTests(tempDir, mainClassName, tests);

    // Generate deterministic job ID from code content
    let hash = 0;
    for (let i = 0; i < javaCode.length; i++) {
      const char = javaCode.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    const jobId = `job-${Math.abs(hash).toString(16)}-${Date.now().toString(36)}`;

    // DEBUG: Print temp dir path before cleaning
    // Clean up is disabled for debugging
    // console.log('[DEBUG API] tempDir =', tempDir);
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return NextResponse.json({
      success: true,
      jobId,
      testResults,
      jsContent: compileRes.jsContent,
      wasmContent: compileRes.wasmContent,
      mainClassName,
    });
  } catch (err: any) {
    if (tempDir) {
      import('fs').then(({ promises: fs }) => fs.rm(tempDir, { recursive: true }).catch(() => {}));
    }
    return NextResponse.json(
      { error: 'Internal error', message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { compileWithECJ, gatherClassFiles } from '@/lib/server/compiler';
import { runIOTests } from '@/lib/server/ioRunner';
import { IOTest } from '@/lib/types';

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

    // Compile
    const compileRes = await compileWithECJ(javaCode, mainClassName, tempDir);
    if (compileRes.exitCode !== 0) {
      return NextResponse.json(
        { error: 'Compilation failed', stderr: compileRes.stderr, stdout: compileRes.stdout },
        { status: 400 }
      );
    }

    // Run I/O tests server-side
    const testResults = await runIOTests(tempDir, mainClassName, tests);

    // Gather class files
    const classFiles = await gatherClassFiles(tempDir);

    // Generate deterministic job ID from code content
    let hash = 0;
    for (let i = 0; i < javaCode.length; i++) {
      const char = javaCode.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    const jobId = `job-${Math.abs(hash).toString(16)}-${Date.now().toString(36)}`;

    // Clean up in background
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return NextResponse.json({
      success: true,
      jobId,
      testResults,
      classFiles,
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

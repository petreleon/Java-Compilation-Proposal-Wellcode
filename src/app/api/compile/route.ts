import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

const JAVA_HOME = '/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home';
const ECJ_JAR = path.resolve(process.cwd(), 'vendor', 'ecj-3.42.0.jar');
const DOPPIO_HOME = path.resolve(process.cwd(), 'vendor');

function execAsync(command: string, args: string[], cwd: string, envExtra: NodeJS.ProcessEnv) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: envExtra,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

type IOTest = {
  input: string;
  expectedOutput: string;
};

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

    tempDir = path.join('/tmp', `javaweb-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const publicClassMatch = javaCode.match(/public\s+class\s+(\w+)/);
    const effectiveFileName = publicClassMatch
      ? `${publicClassMatch[1]}.java`
      : `${mainClassName}.java`;
    const srcPath = path.join(tempDir, effectiveFileName);
    await fs.writeFile(srcPath, javaCode, 'utf8');

    // Compile with ECJ (no javac needed)
    const env: NodeJS.ProcessEnv = { ...process.env, JAVA_HOME };
    const compileRes = await execAsync(
      path.join(JAVA_HOME, 'bin', 'java'),
      ['-jar', ECJ_JAR, '-d', tempDir, srcPath],
      tempDir,
      env
    );

    if (compileRes.exitCode !== 0) {
      return NextResponse.json(
        { error: 'Compilation failed', stderr: compileRes.stderr, stdout: compileRes.stdout },
        { status: 400 }
      );
    }

    // Run I/O tests using DoppioJVM Node CLI
    const testResults: { passed: boolean; input: string; expected: string; actual: string }[] = [];
    for (const test of tests) {
      const child = spawn(
        path.join(JAVA_HOME, 'bin', 'java'),
        ['-cp', tempDir, mainClassName],
        { cwd: tempDir, env }
      );
      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });

      if (test.input) {
        child.stdin.write(test.input + '\n');
      }
      child.stdin.end();

      await new Promise<number>((resolve) => {
        child.on('close', (c) => resolve(c ?? 1));
      });

      const actual = output.replace(/\r?\n$/, '');
      testResults.push({
        passed: actual.trim() === test.expectedOutput.trim(),
        input: test.input,
        expected: test.expectedOutput,
        actual,
      });
    }

    // Gather all .class files as base64
    const classFiles: Record<string, string> = {};
    const entries = await fs.readdir(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.class')) {
        const buf = await fs.readFile(path.join(tempDir, entry.name));
        classFiles[entry.name] = Buffer.from(buf).toString('base64');
      }
    }

    // Clean up temp dir in background
    fs.rm(tempDir, { recursive: true }).catch(() => {});

    return NextResponse.json({
      success: true,
      testResults,
      classFiles,
      mainClassName,
    });
  } catch (err: any) {
    if (tempDir) {
      fs.rm(tempDir, { recursive: true }).catch(() => {});
    }
    return NextResponse.json(
      { error: 'Internal error', message: err?.message || String(err) },
      { status: 500 }
    );
  }
}

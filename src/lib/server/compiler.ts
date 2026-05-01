import { spawn } from 'child_process';
import path from 'path';
import { ECJ_JAR, JAVA_HOME } from './constants';

export interface CompileResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  tempDir: string;
}

export function execAsync(
  command: string,
  args: string[],
  cwd: string,
  envExtra: NodeJS.ProcessEnv
) {
  return new Promise<Pick<CompileResult, 'exitCode' | 'stdout' | 'stderr'>>((resolve) => {
    const child = spawn(command, args, { cwd, env: envExtra });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export async function compileWithECJ(
  javaCode: string,
  mainClassName: string,
  tempDir: string
): Promise<CompileResult> {
  const fs = (await import('fs')).promises;
  const publicClassMatch = javaCode.match(/public\s+class\s+(\w+)/);
  const effectiveFileName = publicClassMatch
    ? `${publicClassMatch[1]}.java`
    : `${mainClassName}.java`;

  const srcPath = path.join(tempDir, effectiveFileName);
  await fs.writeFile(srcPath, javaCode, 'utf8');

  const env: NodeJS.ProcessEnv = { ...process.env, JAVA_HOME };
  const compileRes = await execAsync(
    path.join(JAVA_HOME, 'bin', 'java'),
    ['-jar', ECJ_JAR, '-d', tempDir, srcPath],
    tempDir,
    env
  );

  return { ...compileRes, tempDir };
}

export async function gatherClassFiles(tempDir: string): Promise<Record<string, string>> {
  const fs = (await import('fs')).promises;
  const path = await import('path');
  const classFiles: Record<string, string> = {};
  const entries = await fs.readdir(tempDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.class')) {
      const buf = await fs.readFile(path.join(tempDir, entry.name));
      classFiles[entry.name] = Buffer.from(buf).toString('base64');
    }
  }
  return classFiles;
}

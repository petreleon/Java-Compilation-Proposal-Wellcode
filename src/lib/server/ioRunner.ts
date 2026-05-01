import { spawn } from 'child_process';
import path from 'path';
import { IOTest, ServerTestResult } from '../types';
import { JAVA_HOME } from './constants';

export async function runIOTests(
  tempDir: string,
  mainClassName: string,
  tests: IOTest[]
): Promise<ServerTestResult[]> {
  const env: NodeJS.ProcessEnv = { ...process.env, JAVA_HOME };
  const results: ServerTestResult[] = [];

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
    results.push({
      passed: actual.trim() === test.expectedOutput.trim(),
      input: test.input,
      expected: test.expectedOutput,
      actual,
    });
  }

  return results;
}

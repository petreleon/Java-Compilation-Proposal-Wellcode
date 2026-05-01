export interface IOTest {
  input: string;
  expectedOutput: string;
}

export interface ServerTestResult {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
}

export interface CompileResponse {
  success: true;
  jobId: string;
  testResults: ServerTestResult[];
  classFiles: Record<string, string>;
  mainClassName: string;
}

export interface CompileErrorResponse {
  error: string;
  stderr?: string;
  stdout?: string;
  message?: string;
}

export interface BrowserJob {
  jobId: string;
  classFiles: Record<string, string>;
  mainClassName: string;
  stdin: string;
  createdAt: number;
}

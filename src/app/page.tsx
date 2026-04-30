'use client';

import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Plus, Trash2, TestTube, Code2, Globe } from 'lucide-react';

interface IOTest {
  input: string;
  expectedOutput: string;
}

export default function Home() {
  const [javaCode, setJavaCode] = useState(`import java.util.Scanner;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println("Hello, " + name + "!");
    }
}`);
  const [mainClassName, setMainClassName] = useState('Solution');
  const [tests, setTests] = useState<IOTest[]>(([
    { input: 'World', expectedOutput: 'Hello, World!' },
    { input: 'TeaVM', expectedOutput: 'Hello, TeaVM!' },
  ]));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    testResults: { passed: boolean; input: string; expected: string; actual: string }[];
    classFiles?: Record<string, string>;
    mainClassName: string;
  } | null>(null);

  const addTest = () => setTests((t) => [...t, { input: '', expectedOutput: '' }]);
  const removeTest = (idx: number) => setTests((t) => t.filter((_, i) => i !== idx));
  const updateTest = (idx: number, field: keyof IOTest, value: string) => {
    setTests((t) => t.map((test, i) => (i === idx ? { ...test, [field]: value } : test)));
  };

  const handleCompile = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('javaCode', javaCode);
      form.append('mainClassName', mainClassName);
      form.append('tests', JSON.stringify(tests));

      const res = await fetch('/api/compile', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`Error: ${data.error}\n${data.stderr || data.message || ''}`);
        return;
      }

      setResult(data);
    } catch (e: any) {
      alert('Request failed: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [javaCode, mainClassName, tests]);

  const openInBrowser = () => {
    if (!result?.classFiles) return;
    sessionStorage.setItem('doppio_run', JSON.stringify({
      classFiles: result.classFiles,
      mainClassName: result.mainClassName,
    }));
    window.open('/run', '_blank');
  };

  return (
    <main className="flex flex-col min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-gray-800/10 px-6 py-4 flex items-center gap-3">
        <Code2 className="w-6 h-6 text-emerald-500" />
        <h1 className="text-xl font-semibold tracking-tight">Java WebAssembly Playground</h1>
      </header>

      <section className="flex flex-1 overflow-hidden">
        <div className="flex flex-col w-1/2 border-r border-gray-800/10">
          <div className="px-4 py-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/30">
            <label className="text-sm font-medium">Main class name</label>
            <input
              value={mainClassName}
              onChange={(e) => setMainClassName(e.target.value)}
              className="block rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage="java"
              theme="vs-dark"
              value={javaCode}
              onChange={(v) => setJavaCode(v || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col w-1/2">
          <div className="px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900/30">
            <div className="flex items-center gap-2">
              <TestTube className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">I/O Tests</span>
            </div>
            <button
              onClick={addTest}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add test
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {tests.map((test, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Test {idx + 1}
                  </span>
                  <button
                    onClick={() => removeTest(idx)}
                    className="text-gray-400 hover:text-red-500"
                    title="Remove test"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Input (stdin)</label>
                    <textarea
                      value={test.input}
                      onChange={(e) => updateTest(idx, 'input', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Expected Output</label>
                    <textarea
                      value={test.expectedOutput}
                      onChange={(e) => updateTest(idx, 'expectedOutput', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            {result && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Test Results</span>
                  <div className="flex gap-2">
                    {result.classFiles && (
                      <button
                        onClick={openInBrowser}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Globe className="w-3.5 h-3.5" /> Open in browser
                      </button>
                    )}
                  </div>
                </div>
                <ul className="space-y-2">
                  {result.testResults.map((tr, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                        tr.passed
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                      }`}
                    >
                      <span className="mt-0.5">
                        {tr.passed ? (
                          <span className="font-bold">PASS</span>
                        ) : (
                          <span className="font-bold">FAIL</span>
                        )}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium">
                          Input: <code className="rounded bg-black/5 dark:bg-white/10 px-1">{tr.input}</code>
                        </div>
                        <div className="mt-0.5">
                          Expected: <code className="rounded bg-black/5 dark:bg-white/10 px-1">{tr.expected}</code>
                        </div>
                        {!tr.passed && (
                          <div className="mt-0.5">
                            Actual: <code className="rounded bg-black/5 dark:bg-white/10 px-1">{tr.actual}</code>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {result.classFiles && (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Class files ready for browser execution.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-800/10 px-6 py-3 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/30">
        {loading && <span className="text-sm text-gray-500 animate-pulse">Building & testing...</span>}
        <button
          onClick={handleCompile}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          <Play className="w-4 h-4" />
          {loading ? 'Compiling...' : 'Compile & Run Tests'}
        </button>
      </footer>
    </main>
  );
}

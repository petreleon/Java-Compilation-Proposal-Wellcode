'use client';

import { Plus, Trash2, TestTube, Globe } from 'lucide-react';
import { IOTest, CompileResponse, CompileErrorResponse } from '@/lib/types';

interface TestPanelProps {
  tests: IOTest[];
  onChange: (tests: IOTest[]) => void;
  result: CompileResponse | null;
  error: CompileErrorResponse | null;
  loading: boolean;
  onCompile: () => void;
  onOpenBrowser: () => void;
}

export function TestPanel({
  tests,
  onChange,
  result,
  error,
  loading,
  onCompile,
  onOpenBrowser,
}: TestPanelProps) {
  const addTest = () => onChange([...tests, { input: '', expectedOutput: '' }]);
  const removeTest = (idx: number) => onChange(tests.filter((_, i) => i !== idx));
  const updateTest = (idx: number, field: keyof IOTest, value: string) => {
    onChange(tests.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  return (
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

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
            <p className="font-semibold">{error.error}</p>
            {error.stderr && <pre className="mt-2 whitespace-pre-wrap text-xs opacity-80">{error.stderr}</pre>}
            {error.message && <p className="mt-1 opacity-80">{error.message}</p>}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Test Results</span>
              <div className="flex gap-2">
                <button
                  data-testid="open-browser-btn"
                  onClick={onOpenBrowser}
                  disabled={!result.jsContent && !result.wasmContent}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <Globe className="w-3.5 h-3.5" /> Open in browser
                </button>
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
                  <span className="mt-0.5 font-bold">{tr.passed ? 'PASS' : 'FAIL'}</span>
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
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Code2 } from 'lucide-react';
import { IOTest, CompileResponse, CompileErrorResponse } from '@/lib/types';
import { saveJob } from '@/lib/client/storage';
import { TestPanel } from './TestPanel';

interface EditorPageProps {
  initialCode: string;
  initialMainClass: string;
  initialTests: IOTest[];
  'data-testid'?: string;
}

export default function EditorPage({
  initialCode,
  initialMainClass,
  initialTests,
  'data-testid': pageTestId,
}: EditorPageProps) {
  const [javaCode, setJavaCode] = useState(initialCode);
  const [mainClassName, setMainClassName] = useState(initialMainClass);
  const [tests, setTests] = useState<IOTest[]>(initialTests);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [error, setError] = useState<CompileErrorResponse | null>(null);

  const handleCompile = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setError(null);
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
        setError(data as CompileErrorResponse);
        return;
      }

      setResult(data as CompileResponse);
    } catch (e: any) {
      setError({ error: 'Request failed', message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }, [javaCode, mainClassName, tests]);

  const openInBrowser = () => {
    if (!result?.classFiles || !result?.jobId) return;

    const job = {
      jobId: result.jobId,
      classFiles: result.classFiles,
      mainClassName: result.mainClassName,
      stdin: '',
      createdAt: Date.now(),
    };
    saveJob(job);
    window.open(`/run?jobId=${encodeURIComponent(result.jobId)}`, '_blank');
  };

  return (
    <main data-testid={pageTestId} className="flex flex-col min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-gray-800/10 px-6 py-4 flex items-center gap-3">
        <Code2 className="w-6 h-6 text-emerald-500" />
        <h1 data-testid="app-title" className="text-xl font-semibold tracking-tight">Java Browser Runtime</h1>
      </header>

      <section className="flex flex-1 overflow-hidden">
        <div data-testid="editor-section" className="flex flex-col w-1/2 border-r border-gray-800/10">
          <div className="px-4 py-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/30">
            <label className="text-sm font-medium">Main class name</label>
            <input
              data-testid="main-class-input"
              value={mainClassName}
              onChange={(e) => setMainClassName(e.target.value)}
              className="block rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div data-testid="monaco-container" className="flex-1 min-h-0">
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

        <TestPanel
          tests={tests}
          onChange={setTests}
          result={result}
          error={error}
          loading={loading}
          onCompile={handleCompile}
          onOpenBrowser={openInBrowser}
        />
      </section>

      <footer className="border-t border-gray-800/10 px-6 py-3 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/30">
        {loading && <span className="text-sm text-gray-500 animate-pulse">Building & testing...</span>}
        <button
          data-testid="compile-btn"
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

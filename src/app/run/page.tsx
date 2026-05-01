'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import Terminal from '@/components/Terminal';
import { getJob } from '@/lib/client/storage';
import { bootJVM, StdinController } from '@/lib/client/doppio';
import type { BrowserJob } from '@/lib/types';

function RunContent() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('Loading runtime libraries…');
  const [scriptsLoaded, setScriptsLoaded] = useState(0);
  const [inputVisible, setInputVisible] = useState(false);
  const hasBooted = useRef(false);
  const stdinCtrlRef = useRef<StdinController | null>(null);

  // Read URL params client-side only to avoid hydration mismatch with useSearchParams
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BrowserJob | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('jobId');
    setJobId(id);
    if (id) setJob(getJob(id));
  }, []);

  const append = (text: string) => {
    const el = document.getElementById('jvm-term') as HTMLPreElement | null;
    if (!el) return;
    if (el.textContent === 'Loading…') el.textContent = '';
    el.appendChild(document.createTextNode(text));
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (scriptsLoaded < 2 || hasBooted.current || !job) return;
    hasBooted.current = true;

    let cancelled = false;

    bootJVM(
      job,
      (s) => {
        if (!cancelled) setStatus(s);
      },
      (text) => {
        if (!cancelled) append(text);
      },
      () => {
        if (!cancelled) setInputVisible(true);
      },
      (code) => {
        if (!cancelled) {
          setInputVisible(false);
          setStatus(`Finished with exit code ${code}.`);
        }
      }
    ).then((ctrl) => {
      stdinCtrlRef.current = ctrl;
    });

    return () => {
      cancelled = true;
      // NOTE: do NOT reset hasBooted.current here. React StrictMode
      // unmounts/remounts components in DEV, and resetting hasBooted
      // causes a SECOND JVM to boot on the remount. hasBooted is a
      // one-way gate — once the JVM boots, it stays booted.
    };
  }, [scriptsLoaded, job]);

  const sendInput = () => {
    const el = inputRef.current;
    if (!el || !stdinCtrlRef.current) return;
    const text = el.value;
    if (!text) return;
    el.value = '';
    append(text + '\n');
    stdinCtrlRef.current.push(text);
  };

  let content: React.ReactNode;
  if (!jobId) {
    content = (
      <div className="flex items-center justify-center h-full text-red-500">
        Missing jobId. Go back and compile first.
      </div>
    );
  } else if (!job) {
    content = (
      <div className="flex items-center justify-center h-full text-red-500">
        Job not found or expired. Go back and compile again.
      </div>
    );
  } else {
    content = <Terminal id="jvm-term" />;
  }

  return (
    <>
      <Script
        src="/doppio/setimmediate-polyfill.js"
        strategy="beforeInteractive"
      />
      <Script
        src="/doppio/browserfs.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptsLoaded((s) => s + 1)}
      />
      <Script
        src="/doppio/doppio.js"
        strategy="afterInteractive"
        onLoad={() => setScriptsLoaded((s) => s + 1)}
      />

      <main className="flex flex-col h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-gray-800/10 px-6 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900/30">
          <h1 className="text-base font-semibold">Run in Browser (DoppioJVM)</h1>
          <span className="text-sm text-gray-500">{status}</span>
        </header>

      <div data-testid="terminal-container" className="flex-1 p-6 overflow-auto">{content}</div>

      {inputVisible && job && (
        <div data-testid="stdin-area" className="px-6 py-3 border-t border-gray-800/10 bg-gray-50 dark:bg-gray-900/30 flex items-center gap-3">
          <span className="text-sm font-mono text-gray-400">&gt;</span>
          <input
            data-testid="stdin-input"
            ref={inputRef}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && sendInput()}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Type input and press Enter…"
          />
          <button
            data-testid="send-btn"
            onClick={sendInput}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            Send
          </button>
        </div>
      )}

        <footer className="border-t border-gray-800/10 px-6 py-3 flex items-center justify-end bg-gray-50 dark:bg-gray-900/30 gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            Run again
          </button>
        </footer>
      </main>
    </>
  );
}

export default function RunPage() {
  return <RunContent />;
}

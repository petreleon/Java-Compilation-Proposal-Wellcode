'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import Script from 'next/script';

function RunContent() {
  const outputRef = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState('Loading runtime libraries...');
  const [output, setOutput] = useState('');
  const [scriptsLoaded, setScriptsLoaded] = useState(0);

  const appendOutput = (text: string) => {
    setOutput((prev) => prev + text);
  };

  useEffect(() => {
    if (scriptsLoaded < 2) return;

    const run = async () => {
      try {
        const BrowserFS = (window as any).BrowserFS;
        const Doppio = (window as any).Doppio;
        if (!BrowserFS || !Doppio) {
          setStatus('Failed to load Doppio runtime libraries.');
          return;
        }

        setStatus('Initializing filesystem...');

        // Fetch the doppio_home.zip as ArrayBuffer and convert to Uint8Array
        const zipResp = await fetch('/doppio/doppio_home.zip');
        const zipArrayBuffer = await zipResp.arrayBuffer();
        const zipData = new Uint8Array(zipArrayBuffer);

        BrowserFS.configure(
          {
            fs: 'OverlayFS',
            options: {
              readable: {
                fs: 'ZipFS',
                options: {
                  zipData: zipData,
                  name: 'doppio_home',
                },
              },
              writable: {
                fs: 'LocalStorage',
                options: {},
              },
            },
          },
          (err: any) => {
            if (err) {
              setStatus('Filesystem error: ' + err.message);
              return;
            }

            const fs = BrowserFS.BFSRequire('fs');
            const path = BrowserFS.BFSRequire('path');
            const process = BrowserFS.BFSRequire('process');

            // Create /home directory for user classes
            try {
              fs.mkdirSync('/home');
            } catch (e) {
              /* already exists */
            }
            process.chdir('/home');

            // Retrieve class files from sessionStorage
            const stored = sessionStorage.getItem('doppio_run');
            if (!stored) {
              setStatus('No class files found. Compile first.');
              return;
            }
            const { classFiles, mainClassName } = JSON.parse(stored);

            setStatus('Writing class files...');
            for (const [fileName, b64] of Object.entries(classFiles) as [string, string][]) {
              const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
              fs.writeFileSync(path.join('/home', fileName), bytes);
            }

            // Hook stdout/stderr before booting JVM
            const origStdoutWrite = process.stdout.write.bind(process.stdout);
            const origStderrWrite = process.stderr.write.bind(process.stderr);
            process.stdout.write = (data: any) => {
              appendOutput(String(data));
              return origStdoutWrite(data);
            };
            process.stderr.write = (data: any) => {
              appendOutput(String(data));
              return origStderrWrite(data);
            };

            setStatus('Booting JVM...');

            // Manually construct JVM options so doppioHomePath points to root (/)
            // where vendor/java_home and natives/ reside in the ZipFS overlay.
            const opts = {
              doppioHomePath: '/',
              classpath: ['/home'],
              bootstrapClasspath: [
                '/vendor/java_home/lib/rt.jar',
                '/vendor/java_home/lib/doppio.jar',
                '/vendor/java_home/lib/jce.jar',
                '/vendor/java_home/lib/jsse.jar',
                '/vendor/java_home/lib/charsets.jar',
                '/vendor/java_home/lib/ext/localedata.jar',
                '/vendor/java_home/lib/ext/dnsns.jar',
                '/vendor/java_home/lib/ext/sunjce_provider.jar',
                '/vendor/java_home/lib/ext/sunpkcs11.jar',
                '/vendor/java_home/lib/ext/zipfs.jar',
                '/vendor/java_home/lib/ext/nashorn.jar',
              ],
              javaHomePath: '/vendor/java_home',
              nativeClasspath: ['/natives'],
              properties: {},
              tmpDir: '/tmp',
              responsiveness: 1000,
              intMode: false,
              dumpJITStats: false,
            };

            new Doppio.VM.JVM(opts, (err2: any, jvm: any) => {
              if (err2) {
                setStatus('JVM boot failed: ' + err2.message);
                return;
              }
              setStatus(`Running ${mainClassName}...`);
              jvm.runClass(mainClassName, [], (exitCode: number) => {
                setStatus(`Finished with exit code ${exitCode}.`);
                jvm.halt(exitCode);
              });
            });
          }
        );
      } catch (e: any) {
        setStatus('Error: ' + (e?.message || String(e)));
      }
    };

    run();
  }, [scriptsLoaded]);

  // Auto-scroll output
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  return (
    <>
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

        <div className="flex-1 p-6">
          <pre
            ref={outputRef}
            className="w-full h-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-900 text-gray-100 p-4 font-mono text-sm leading-relaxed"
          >
            {output || 'Loading...'}
          </pre>
        </div>

        <footer className="border-t border-gray-800/10 px-6 py-3 flex items-center justify-end bg-gray-50 dark:bg-gray-900/30 gap-3">
          <button
            onClick={() => {
              setOutput('');
              setStatus('Re-running...');
              window.location.reload();
            }}
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
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-sm text-gray-500">
          Loading...
        </div>
      }
    >
      <RunContent />
    </Suspense>
  );
}

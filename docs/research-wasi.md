# TeaVM C→Emscripten with Browser Stdin: Research Findings

## Current Status
- TeaVM 0.12.3 C backend works end-to-end: `Hello.java` → `all.c` → Emscripten `runtime.js` + `runtime.wasm`
- Server-side compile pipeline complete (`/api/compile` returns base64 JS+WASM)
- **Browser stdin is partially working** via `-s FORCE_FILESYSTEM=1` + `FS.init()`
- Emscripten `ASYNCIFY=1` allows `BufferedReader.readLine()` blocking calls

## What Works Today
1. `BufferedReader + InputStreamReader` (TeaVM's `ConsoleInputStream` maps to `System.in`)
2. `System.out.println()` prints to browser terminal
3. Emscripten `runtime.js` loads correctly in `/run` page with blob URL
4. Server I/O tests pass using ECJ → TeaVM C → Emscripten WASM

## What Doesn't Work Yet
### C stdio ↔ Emscripten `FS.init()` bridge
TeaVM C maps `java.lang.System.in` → C `getchar()` / `fgetc()`.

Emscripten with `FORCE_FILESYSTEM=1` includes `FS.init()`, but the generated `runtime.js` uses `flush_NO_FILESYSTEM()` (no actual TTY `fd_read` implementation). While `FS.init()` exists, the `__wasi_fd_read` import from the WASM is not implemented by the `ENVIRONMENT=web` target.

**This means `BufferedReader.readLine()` blocks forever waiting for stdin that never arrives** — even with `ASYNCIFY=1`, because there's no actual file descriptor read path.

## Why Option C (WASM + WASI) Is Blocked

### 1. TeaVM 0.12.3 WASM backend has no browser embedding
- `-t wasm` produces `main.c` (200KB WAT-style C) + `main.wasm-runtime.js` (9KB)
- `main.wasm-runtime.js` has **zero** references to `stdin`, `fd_read`, `tty`, or `FS`
- It's a raw WASI-Preview-1-ish module with no browser-side host implementation

### 2. PR #610 (WASI support) was closed unmerged
- Author: dicej (not an official maintainer)
- Adds `TeaVMTargetType.WASI` but was never merged into upstream
- TeaVM 0.12.3 and 0.13.x both lack WASI target
- User explicitly required **official TeaVM releases only** — no dicej fork

### 3. `jco` requires a WASI Component
- `jco` (`@bytecodealliance/jco`) transpiles WebAssembly **Components** into JS
- TeaVM WASM output is a **raw wasm module**, not a Component
- To use `jco`, we'd need to:
  a. Build a forked TeaVM with WASI support (PR #610)
  b. Add `-t wasi` target
  c. Wrap TeaVM output as a WASI Preview 2 Component using `wasm-tools component embed`
  d. Use `jco transpile` to generate browser-compatible JS + `preview2-shim`
  e. Implement a WASI `stdin` provider in the browser shim

This is a **multi-week research + build engineering effort**, not a quick fix.

## Recommendation

**Switch to TeaVM JavaScript backend (`-t javascript`)**.

### Why this works better:
1. **No Emscripten dependency** — simpler build pipeline
2. **Built-in browser stdout** — `System.out.println()` maps to JS `console.log()` or custom function
3. **Non-blocking stdin is easier** — TeaVM JS backend provides `teavm_stdin` callback hook
4. **No WASI/Component complexity**
5. **Smaller output** — ~few hundred KB JS vs ~300KB JS + ~320KB WASM + Emscripten glue

### JS Backend constraints (acceptable):
- `Scanner` class is missing from TeaVM classlib — we already switched to `BufferedReader`
- Some Java features unsupported (reflection beyond basics, ` Unsafe`, native libs) — acceptable for a coding challenge platform

## Next Steps
1. Update compile pipeline to use TeaVM `-t javascript` instead of C → Emscripten
2. Remove Emscripten SDK dependency from build
3. Keep `vendor/teavm-*.jar` (same jars, JS target is the same CLI)
4. Update `/run/page.tsx` to load TeaVM JS runtime instead of Emscripten WASM
5. Implement `teavm_stdin` callback for interactive input

## Files Requiring Changes
- `src/lib/server/teavm-emscripten.ts` → rename and switch to JS backend
- `src/app/run/page.tsx` → load JS runtime instead of WASM blob
- `src/lib/types.ts` → change `wasmContent` to `jsContent` only (or keep both for future)
- `e2e/integration.spec.ts` → update assertions
- Remove `vendor/fiber-emscripten.c` (Emscripten-specific stub)

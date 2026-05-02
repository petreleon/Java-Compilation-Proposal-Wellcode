# Java Browser Runtime

A [Next.js](https://nextjs.org) project that compiles and runs Java code directly in the browser using [TeaVM](https://teavm.org/) compiled to WebAssembly via [Emscripten](https://emscripten.org/).

## How it works

1. **Server-side compilation**: Java source is compiled to bytecode with the [Eclipse Compiler for Java (ECJ)](https://www.eclipse.org/jdt/).
2. **Bytecode → C**: TeaVM's C backend translates the bytecode to C source code.
3. **C → WebAssembly**: Emscripten compiles the C output to WebAssembly with patches for:
   - **stdin**: reads from a `SharedArrayBuffer` inside a WebWorker using `Atomics.wait`/`notify`
   - **stdout**: captured via `printf` → Emscripten `Module.print` → `postMessage` back to the main thread
4. **Browser execution**: A WebWorker loads the generated `.js` + `.wasm` runtime and communicates with the main thread for terminal I/O.

## Prerequisites

- **Java Development Kit (JDK):** JDK 17+ installed and `JAVA_HOME` set.
- **Emscripten SDK (emsdk):** Required for compiling C to WebAssembly.
- **Node.js & npm:** For the Next.js frontend.

## Getting Started

Install dependencies and start the dev server:

```bash
npm install   # downloads TeaVM jars automatically via postinstall
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React + Monaco Editor |
| Server compilation | ECJ → TeaVM C backend → Emscripten |
| Browser runtime | WebWorker + SharedArrayBuffer + Atomics |
| I/O | Custom patched `ConsoleInputStream.c` for stdin, `log.c` for stdout |

## Key files

- `src/lib/server/teavm-emscripten.ts` — compile pipeline (ECJ → TeaVM → Emscripten)
- `public/worker.js` — WebWorker that boots the Emscripten runtime
- `src/lib/client/teavm-worker.ts` — client-side worker bootstrap and stdin controller
- `src/app/run/page.tsx` — terminal UI for running compiled programs

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TeaVM](https://teavm.org/)
- [Emscripten](https://emscripten.org/)

## Deployment

Any Node.js platform (Vercel, VPS, etc.) works as long as Java and Emscripten are available in the environment.

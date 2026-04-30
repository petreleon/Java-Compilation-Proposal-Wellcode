This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

It features a browser-based Java compiler and executor using the DoppioJVM project. The application compiles Java code server-side with the Eclipse Compiler for Java (ECJ) and then executes the resulting bytecode directly in the browser using a pure-JavaScript JVM implementation.

## Prerequisites

You will need to ensure your Java environment is set up correctly before running the project, as it's used by the server for the actual compilation step and for running tests.

1.  **Java Development Kit (JDK):** Install JDK 17.
2.  **Apache Maven:** Ensure `mvn` is available in your system path.
3.  **Node.js & npm:** Install Node.js and npm.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The environment will automatically download its required large assets on the first start.

## Learn More

To learn more about the technologies used, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [DoppioJVM](https://github.com/plasma-umass/doppio) - the JavaScript-based JVM used for client-side execution.

## Deployment

This project can be deployed to any platform that supports Node.js, like Vercel or a traditional VPS, as long as Java is installed in the deployment environment.

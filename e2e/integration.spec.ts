import { test, expect } from '@playwright/test';

async function waitForEditorReady(page: any, timeout = 60_000) {
  await page.goto('/');
  // Wait until Monaco replaces the "Loading..." placeholder
  await page.waitForSelector('.monaco-editor', { timeout });
}

async function typeIntoMonaco(page: any, code: string) {
  await waitForEditorReady(page);
  // Focus the editor surface (not the hidden textarea)
  await page.locator('.monaco-editor').first().click();
  // Select all existing content using Ctrl+A, then type the new code
  await page.keyboard.press('Control+a');
  await page.keyboard.type(code);
  await page.keyboard.press('Escape');
}

test('compile good code, run in browser, stdin produces correct output', async ({ page, request }) => {
  const code = `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;

public class Hello {
    public static void main(String[] args) throws IOException {
        System.out.println("What is your name?");
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String name = br.readLine();
        System.out.println("Hello, " + name + "!");
    }
}`;

  // Direct POST to compile API (avoids Monaco typing overhead)
  const form = new URLSearchParams();
  form.append('javaCode', code);
  form.append('mainClassName', 'Hello');
  form.append('tests', JSON.stringify([]));

  const compileRes = await request.post('/api/compile', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: form.toString(),
  });

  expect(compileRes.status()).toBe(200);
  const compileData = await compileRes.json();
  expect(compileData.mainClassName).toBe('Hello');
  expect(compileData.jsContent).toBeTruthy();
  expect(compileData.wasmContent).toBeTruthy();
  expect(compileData.testResults).toBeInstanceOf(Array);

  // Inject job into sessionStorage and navigate to /run on same page
  await page.goto('/');
  await page.evaluate((jobData) => {
    const key = 'browser_jobs';
    const jobs = JSON.parse(sessionStorage.getItem(key) || '{}');
    jobs[jobData.jobId] = jobData;
    sessionStorage.setItem(key, JSON.stringify(jobs));
  }, {
    jobId: compileData.jobId,
    jsContent: compileData.jsContent,
    wasmContent: compileData.wasmContent,
    mainClassName: compileData.mainClassName,
    stdin: '',
    createdAt: Date.now(),
  });

  await page.goto(`/run?jobId=${encodeURIComponent(compileData.jobId)}`);

  const term = page.locator('#jvm-term');
  await expect(term).toBeVisible();

  // Wait for stdin input to appear
  await expect(page.getByTestId('stdin-input')).toBeVisible({ timeout: 90_000 });

  // Send input
  await page.getByTestId('stdin-input').fill('Playwright');
  await page.getByTestId('send-btn').click();

  // After input, output should appear in terminal
  await expect(term).toContainText('Hello, Playwright!', { timeout: 30_000 });
});

test('compile error shows error panel', async ({ page }) => {
  await typeIntoMonaco(page, 'public class Bad { void main() { System.out.println( } }');

  const [response] = await Promise.all([
    page.waitForResponse(
      (r: any) => r.url().includes('/api/compile') && r.status() === 400,
      { timeout: 30_000 }
    ),
    page.getByTestId('compile-btn').click(),
  ]);

  const error = await response.json();
  expect(error.error).toBeTruthy();
});

// ── Fast runtime-only test (bypasses Monaco for quick iteration) ──
test('runtime stdin/output flow via direct compile POST', async ({ page, request }) => {
  const code = `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;

public class Hello {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String s = br.readLine();
        System.out.println("Echo: " + s);
    }
}`;

  const form = new URLSearchParams();
  form.append('javaCode', code);
  form.append('mainClassName', 'Hello');
  form.append('tests', JSON.stringify([{ input: 'A', expectedOutput: 'Echo: A' }]));

  const compileRes = await request.post('/api/compile', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: form.toString(),
  });

  expect(compileRes.status()).toBe(200);
  const data = await compileRes.json();
  expect(data.jobId).toBeTruthy();
  expect(data.jsContent).toBeTruthy();
  expect(data.wasmContent).toBeTruthy();

  // Inject the job into sessionStorage so /run finds it
  await page.goto('/');
  await page.evaluate((jobData) => {
    const key = 'browser_jobs';
    const jobs = JSON.parse(sessionStorage.getItem(key) || '{}');
    jobs[jobData.jobId] = jobData;
    const ids = Object.keys(jobs).sort((a, b) => jobs[b].createdAt - jobs[a].createdAt);
    for (const id of ids.slice(10)) delete jobs[id];
    sessionStorage.setItem(key, JSON.stringify(jobs));
  }, {
    jobId: data.jobId,
    jsContent: data.jsContent,
    wasmContent: data.wasmContent,
    mainClassName: data.mainClassName,
    stdin: '',
    createdAt: Date.now(),
  });

  // Now navigate to the runtime page directly
  await page.goto(`/run?jobId=${encodeURIComponent(data.jobId)}`);

  const term = page.locator('#jvm-term');
  await expect(term).toBeVisible();

  // Wait for JVM to boot and prompt for input (stdin area appears after onReady)
  await expect(page.getByTestId('stdin-input')).toBeVisible({ timeout: 90_000 });

  // Type input and submit
  await page.getByTestId('stdin-input').fill('DirectPost');
  await page.getByTestId('send-btn').click();

  // After input, program prints output
  await expect(term).toContainText('Echo: DirectPost', { timeout: 30_000 });
});

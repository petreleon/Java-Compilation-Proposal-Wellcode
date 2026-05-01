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

test('compile good code, run in browser, stdin produces correct output', async ({ page }) => {
  const code = `import java.util.Scanner;

public class Hello {
    public static void main(String[] args) {
        System.out.println("What is your name?");
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println("Hello, " + name + "!");
    }
}`;

  await typeIntoMonaco(page, code);
  await page.getByTestId('main-class-input').fill('Hello');

  const [response] = await Promise.all([
    page.waitForResponse(
      (r: any) => r.url().includes('/api/compile') && r.status() === 200,
      { timeout: 60_000 }
    ),
    page.getByTestId('compile-btn').click(),
  ]);

  const compileData = await response.json();
  expect(compileData.mainClassName).toBe('Hello');
  expect(Object.keys(compileData.classFiles)).toContain('Hello.class');
  expect(compileData.testResults).toBeInstanceOf(Array);

  await expect(page.getByTestId('open-browser-btn')).toBeVisible({ timeout: 10_000 });

  // Opens a new tab/popup
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByTestId('open-browser-btn').click(),
  ]);

  const term = popup.locator('#jvm-term');
  await expect(term).toBeVisible();

  // Wait for stdin input to appear (JVM onReady fired = ready for input)
  await expect(popup.getByTestId('stdin-input')).toBeVisible({ timeout: 90_000 });

  // Send input
  await popup.getByTestId('stdin-input').fill('Playwright');
  await popup.getByTestId('send-btn').click();

  // After input, output should appear in terminal
  await expect(term).toContainText('Hello, Playwright!', { timeout: 30_000 });

  await popup.close();
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
  const code = `import java.util.Scanner;

public class Hello {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.nextLine();
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
  expect(Object.keys(data.classFiles)).toContain('Hello.class');

  // Inject the job into sessionStorage so /run finds it
  await page.goto('/');
  await page.evaluate((jobData) => {
    const key = 'doppio_jobs';
    const jobs = JSON.parse(sessionStorage.getItem(key) || '{}');
    jobs[jobData.jobId] = jobData;
    const ids = Object.keys(jobs).sort((a, b) => jobs[b].createdAt - jobs[a].createdAt);
    for (const id of ids.slice(10)) delete jobs[id];
    sessionStorage.setItem(key, JSON.stringify(jobs));
  }, {
    jobId: data.jobId,
    classFiles: data.classFiles,
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

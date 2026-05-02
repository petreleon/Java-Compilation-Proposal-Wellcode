'use client';

import { BrowserJob } from '@/lib/types';

const STORAGE_KEY = 'browser_jobs';

export function generateJobId(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `job-${Math.abs(hash).toString(16)}-${Date.now().toString(36)}`;
}

export function saveJob(job: BrowserJob): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const jobs: Record<string, BrowserJob> = raw ? JSON.parse(raw) : {};
    jobs[job.jobId] = job;
    // Keep only the 10 latest jobs to stay within storage limits
    const ids = Object.keys(jobs).sort(
      (a, b) => jobs[b].createdAt - jobs[a].createdAt
    );
    for (const id of ids.slice(10)) delete jobs[id];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* ignore storage errors */
  }
}

export function getJob(jobId: string): BrowserJob | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const jobs: Record<string, BrowserJob> = raw ? JSON.parse(raw) : {};
    return jobs[jobId] ?? null;
  } catch {
    return null;
  }
}

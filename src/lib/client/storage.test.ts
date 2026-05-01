import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateJobId, saveJob, getJob } from './storage';
import type { BrowserJob } from '../types';

const STORAGE_KEY = 'doppio_jobs';

describe('storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('generateJobId', () => {
    it('always returns a string starting with "job-"', () => {
      const id = generateJobId('class Foo {}');
      expect(id).toMatch(/^job-/);
    });

    it('incorporates code content into hash', () => {
      const id1 = generateJobId('class A {}');
      const id2 = generateJobId('class B {}');
      expect(id1).not.toEqual(id2);
    });

    it('includes a timestamp suffix for uniqueness', () => {
      vi.useFakeTimers();
      const id1 = generateJobId('same');
      vi.advanceTimersByTime(10);
      const id2 = generateJobId('same');
      expect(id1).not.toEqual(id2);
      vi.useRealTimers();
    });
  });

  describe('saveJob', () => {
    it('stores a job under its jobId', () => {
      const job: BrowserJob = {
        jobId: generateJobId('x'),
        classFiles: { 'Foo.class': 'abc' },
        mainClassName: 'Foo',
        stdin: '',
        createdAt: Date.now(),
      };
      saveJob(job);
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      expect(stored[job.jobId]).toEqual(job);
    });

    it('keeps only the last 10 jobs (LRU)', () => {
      for (let i = 0; i < 12; i++) {
        saveJob({
          jobId: `job-${i}`,
          classFiles: {},
          mainClassName: 'Foo',
          stdin: '',
          createdAt: i,
        });
      }
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      const ids = Object.keys(stored);
      expect(ids).toHaveLength(10);
      expect(ids).not.toContain('job-0');
      expect(ids).not.toContain('job-1');
      expect(ids).toContain('job-2');
      expect(ids).toContain('job-11');
    });

    it('gracefully handles storage being full', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() =>
        saveJob({
          jobId: 'x',
          classFiles: {},
          mainClassName: 'Foo',
          stdin: '',
          createdAt: 1,
        })
      ).not.toThrow();
      setItem.mockRestore();
    });
  });

  describe('getJob', () => {
    it('returns null for unknown jobId', () => {
      expect(getJob('nonexistent')).toBeNull();
    });

    it('returns the exact job that was saved', () => {
      const job: BrowserJob = {
        jobId: generateJobId('x'),
        classFiles: { 'Bar.class': 'xyz' },
        mainClassName: 'Bar',
        stdin: 'input',
        createdAt: Date.now(),
      };
      saveJob(job);
      expect(getJob(job.jobId)).toEqual(job);
    });

    it('returns null and does not throw on corrupted storage', () => {
      sessionStorage.setItem(STORAGE_KEY, 'not-json');
      expect(getJob('any')).toBeNull();
    });
  });
});

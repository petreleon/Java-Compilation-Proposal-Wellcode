import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock next/script so Script components don't load real scripts in tests
vi.mock('next/script', () => ({
  default: function MockScript({ onLoad }: { onLoad?: () => void }) {
    if (typeof window !== 'undefined' && onLoad) {
      setTimeout(onLoad, 0);
    }
    return null;
  },
}));

// Mock nextjs environment check for client-only code
Object.defineProperty(window, 'location', {
  writable: true,
  value: { search: '' },
});

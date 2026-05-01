'use client';

import { memo } from 'react';

export interface TerminalProps {
  id?: string;
  placeholder?: string;
}

export default memo(function Terminal({ id = 'jvm-term', placeholder = 'Loading…' }: TerminalProps) {
  return (
    <pre
      id={id}
      className="w-full h-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-900 text-gray-100 p-4 font-mono text-sm leading-relaxed"
    >
      {placeholder}
    </pre>
  );
});

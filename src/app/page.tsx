'use client';

import EditorPage from '@/components/EditorPage';
import { IOTest } from '@/lib/types';

const INITIAL_CODE = `import java.util.Scanner;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println("Hello, " + name + "!");
    }
}`;

const INITIAL_TESTS: IOTest[] = [
  { input: 'World', expectedOutput: 'Hello, World!' },
  { input: 'TeaVM', expectedOutput: 'Hello, TeaVM!' },
];

export default function Home() {
  return (
      <EditorPage
        data-testid="editor-page"
        initialCode={INITIAL_CODE}
        initialMainClass="Solution"
        initialTests={INITIAL_TESTS}
      />
  );
}

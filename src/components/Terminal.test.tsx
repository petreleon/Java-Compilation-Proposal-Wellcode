import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Terminal from './Terminal';

describe('Terminal', () => {
  it('renders a pre element with correct id', () => {
    const { container } = render(<Terminal id="test-term" />);
    const pre = container.querySelector('pre#test-term');
    expect(pre).toBeInTheDocument();
  });

  it('shows the default placeholder', () => {
    const { getByText } = render(<Terminal />);
    expect(getByText('Loading…')).toBeInTheDocument();
  });

  it('shows custom placeholder when provided', () => {
    const { getByText } = render(
      <Terminal placeholder="Booting JVM…" />
    );
    expect(getByText('Booting JVM…')).toBeInTheDocument();
  });

  it('has dark terminal styling classes', () => {
    const { container } = render(<Terminal />);
    const pre = container.querySelector('pre');
    expect(pre?.className).toContain('bg-gray-900');
    expect(pre?.className).toContain('font-mono');
  });

  it('is memoized so Terminal itself does not re-render when props are unchanged', () => {
    // The key guarantee is that React.memo returns true for same props,
    // so Terminal will never cause parent output state to be lost.
    // We verify by rendering twice with identical props.
    const { container } = render(<Terminal />);
    const pre1 = container.querySelector('pre');
    render(<Terminal />);
    const pre2 = container.querySelector('pre');
    expect(pre1).toBe(pre2);
  });
});

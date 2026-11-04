import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Breakable } from '../src/board/Breakable';

// With the u flag the class matches a lone surrogate, never a whole pair.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const ASTRAL = '😀';

function textNodesOf(container: HTMLElement): string[] {
  return [...container.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '');
}

describe('Breakable', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps every astral character of a run whole, so no text node holds a lone surrogate', () => {
    const text = 'a'.repeat(15) + ASTRAL + 'b';
    const { container } = render(<Breakable text={text} />);
    expect(textNodesOf(container).filter((node) => LONE_SURROGATE.test(node))).toEqual([]);
    expect(container.textContent).toBe(text);
  });

  it('breaks a run of astral characters every 16 code points and keeps the text unchanged', () => {
    const text = ASTRAL.repeat(40);
    const { container } = render(<Breakable text={text} />);
    expect(textNodesOf(container).map((node) => [...node].length)).toEqual([16, 16, 8]);
    expect(container.querySelectorAll('wbr')).toHaveLength(2);
    expect(container.textContent).toBe(text);
  });

  it('breaks a run of 16-unit characters every 16 and leaves a space as the only break of a phrase', () => {
    const { container } = render(<Breakable text={'x'.repeat(20) + ' y'} />);
    expect(textNodesOf(container)).toEqual(['x'.repeat(16), 'x'.repeat(4), ' ', 'y']);
    expect(container.querySelectorAll('wbr')).toHaveLength(1);
  });
});

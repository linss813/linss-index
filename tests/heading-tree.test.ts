// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderHeadingTree } from '../src/lib/heading-tree';
describe('heading tree controls', () => {
  it('separates disclosure icon from the navigation label and preserves collapsed state', () => {
    document.body.innerHTML =
      '<nav></nav><h1>父章节</h1><h2>子章节</h2><h3>第三层</h3>';
    const root = document.querySelector('nav')!;
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>('h1,h2,h3'),
    );
    const navigate = vi.fn();
    renderHeadingTree(root, headings, navigate);
    const parent = root.querySelector('details')!;
    const summary = parent.querySelector('summary')!;
    expect(summary.querySelector('svg.toc-chevron')).not.toBeNull();
    expect(summary.children[0].tagName.toLowerCase()).toBe('svg');
    summary.querySelector('button')!.click();
    expect(navigate).toHaveBeenCalledWith(0);
    expect(parent.open).toBe(true);
    parent.open = false;
    renderHeadingTree(root, headings, navigate);
    expect(root.querySelector('details')!.open).toBe(false);
    expect(root.querySelectorAll('.toc-children')).toHaveLength(2);
  });
});

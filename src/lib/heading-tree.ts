/** 用实际标题级别建立折叠目录，跳级标题也归入最近的上级。 */
export function renderHeadingTree(
  root: HTMLElement,
  headings: HTMLElement[],
  navigate: (index: number) => void,
) {
  const open = new Set(
    Array.from(root.querySelectorAll<HTMLDetailsElement>('details[open]')).map(
      (el) => el.dataset.key,
    ),
  );
  const first = !root.querySelector('.toc-node');
  root.replaceChildren();
  const stack: { level: number; container: HTMLElement }[] = [
    { level: 0, container: root },
  ];
  headings.forEach((heading, index) => {
    const level = Number(heading.tagName.slice(1));
    while (stack.length > 1 && stack[stack.length - 1].level >= level)
      stack.pop();
    const parent = stack[stack.length - 1].container;
    const hasChildren =
      Number(headings[index + 1]?.tagName.slice(1) || 0) > level;
    const row = document.createElement(hasChildren ? 'details' : 'div');
    row.className = 'toc-node';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = heading.textContent || '未命名章节';
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigate(index);
    };
    if (row instanceof HTMLDetailsElement) {
      row.dataset.key = `${index}:${heading.textContent}`;
      row.open = first || open.has(row.dataset.key);
      const summary = document.createElement('summary');
      const arrow = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      );
      arrow.classList.add('toc-chevron');
      arrow.setAttribute('viewBox', '0 0 24 24');
      arrow.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      path.setAttribute('d', 'm9 5 7 7-7 7');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      arrow.append(path);
      summary.append(arrow, button);
      row.append(summary);
      const children = document.createElement('div');
      children.className = 'toc-children';
      row.append(children);
      stack.push({ level, container: children });
    } else row.append(button);
    parent.append(row);
  });
}

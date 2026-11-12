// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import BlockEditor from '../src/lib/block-editor';
let editor: BlockEditor;
beforeEach(() => {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  editor = new BlockEditor({ el: host });
});
afterEach(() => {
  editor.editor.destroy();
  document.body.replaceChildren();
});
describe('block authoring interactions', () => {
  it('selects slash commands without moving keyboard focus into the popup', () => {
    editor.editor.commands.insertContent('/');
    const from = editor.editor.state.selection.from;
    editor.editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.menuIndex).toBe(1);
    expect(editor.editor.state.selection.from).toBe(from);
    editor.editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.editor.isActive('heading', { level: 1 })).toBe(true);
    expect(editor.getMarkdown()).not.toContain('/');
  });
  it('converts fenced code and compact Chinese headings on Enter', () => {
    editor.editor.commands.insertContent('```sh');
    expect(editor.handleBlockShortcut()).toBe(true);
    expect(editor.editor.getAttributes('codeBlock').language).toBe('sh');
    editor.setMarkdown('');
    editor.editor.commands.insertContent('###三级标题');
    expect(editor.handleBlockShortcut()).toBe(true);
    expect(editor.getHTML()).toContain('<h3>三级标题</h3>');
    expect(editor.editor.state.doc.lastChild?.type.name).toBe('paragraph');
  });
  it('shows active formatting and can explicitly clear it', () => {
    editor.exec('bold');
    editor.exec('italic');
    editor.editor.commands.insertContent('测试');
    expect(
      document.querySelector('[aria-label=粗体]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    editor.exec('clearFormat');
    expect(
      document.querySelector('[aria-label=粗体]')?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      document.querySelector('[aria-label=斜体]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('opens a searchable slash menu and inserts the selected heading without retaining the slash', () => {
    editor.editor.commands.insertContent('/h3');
    expect(editor.menu.hidden).toBe(false);
    const command = editor.menu.querySelector<HTMLButtonElement>('button')!;
    expect(command.textContent).toBe('三级标题');
    command.click();
    editor.editor.commands.insertContent('章节标题');
    expect(editor.getHTML()).toContain('<h3>章节标题</h3>');
    expect(editor.getMarkdown()).not.toContain('/h3');
  });
  it('keeps lists, task state, code language and tables through JSON loading', () => {
    const markdown =
      '## 标题\n\n- 项目一\n- 项目二\n\n- [x] 已完成\n\n```sh\necho hello\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
    editor.setMarkdown(markdown);
    const json = editor.getJSON();
    editor.setJSON(json);
    expect(editor.getHTML()).toContain('language-sh');
    expect(editor.getHTML()).toContain('data-checked="true"');
    expect(editor.getHTML()).toContain('<table');
    expect(editor.getMarkdown()).toContain('echo hello');
  });
  it('reorders blocks without duplicating or dropping content', () => {
    editor.setHTML('<p>第一块</p><p>第二块</p><p>第三块</p>');
    editor.moveBlock(0, 1);
    expect(editor.editor.getText()).toBe('第二块\n\n第一块\n\n第三块');
    const position = editor.editor.state.doc.child(0).nodeSize;
    editor.moveBlock(position, -1);
    expect(editor.editor.getText()).toBe('第一块\n\n第二块\n\n第三块');
  });
  it('serializes callout and folding blocks and provides readable Markdown export', () => {
    editor.setJSON({
      type: 'doc',
      content: [
        {
          type: 'callout',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '提示正文' }],
            },
          ],
        },
        {
          type: 'fold',
          attrs: { title: '折叠标题' },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '隐藏内容' }],
            },
          ],
        },
      ],
    });
    expect(editor.getHTML()).toContain('data-callout');
    expect(editor.getHTML()).toContain('折叠标题');
    expect(editor.getMarkdown()).toContain('提示正文');
    expect(editor.getMarkdown()).toContain('隐藏内容');
  });
  it('keeps a newly loaded document when switching articles in Markdown mode', () => {
    editor.setMarkdown('第一篇');
    editor.changeMode('markdown');
    editor.setJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第二篇' }] },
      ],
    });
    expect(editor.getMarkdown()).toContain('第二篇');
    expect(editor.getHTML()).toContain('第二篇');
    expect(editor.getHTML()).not.toContain('第一篇');
  });
  it('preserves legacy HTML source and rejects unknown JSON block types', () => {
    const original =
      '<video src="/uploads/video.mp4" controls></video><p>旧文章</p>';
    editor.setLegacyHTML(original);
    expect(editor.getHTML()).toBe(original);
    expect(editor.getJSON()).toBeUndefined();
    expect(editor.getMarkdown()).toContain('旧文章');
    expect(() =>
      editor.setJSON({ type: 'doc', content: [{ type: 'unknownBlock' }] }),
    ).toThrow();
    editor.setHTML('<p>新文章</p>');
    expect(editor.legacyHTML).toBe(false);
    expect(editor.getHTML()).toContain('新文章');
  });
  it('inserts a visible link when no text is selected', () => {
    editor.exec('link');
    const form = document.querySelector<HTMLFormElement>('.block-panel form')!;
    (form.querySelector('[name=href]') as HTMLInputElement).value =
      'https://example.com';
    (form.querySelector('[name=text]') as HTMLInputElement).value = '示例链接';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(editor.getHTML()).toContain('示例链接</a>');
    expect(editor.getHTML()).toContain('https://example.com');
  });
  it('opens actionable insert menus and image/link panels', () => {
    const more = document.querySelector<HTMLButtonElement>(
      '[aria-label="插入更多内容"]',
    )!;
    more.click();
    const link = Array.from(
      editor.menu.querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent === '链接')!;
    link.click();
    expect(document.querySelector('dialog[open] h3')?.textContent).toBe(
      '插入链接',
    );
    expect(editor.menu.hidden).toBe(true);
  });
});

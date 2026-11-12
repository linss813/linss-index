import { Editor as Tiptap, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from '@tiptap/markdown';
import './block-editor.css';
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  renderMarkdown: (node, h) => h.renderChildren(node.content || []),
  parseHTML: () => [{ tag: 'aside[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'aside',
    mergeAttributes(HTMLAttributes, { 'data-callout': '' }),
    0,
  ],
});
const Fold = Node.create({
  name: 'fold',
  group: 'block',
  content: 'block+',
  defining: true,
  renderMarkdown: (node, h) => h.renderChildren(node.content || []),
  addAttributes: () => ({ title: { default: '点击展开' } }),
  parseHTML: () => [{ tag: 'details[data-fold]', contentElement: 'div' }],
  renderHTML: ({ HTMLAttributes }) => [
    'details',
    { 'data-fold': '', open: '' },
    ['summary', {}, String(HTMLAttributes.title || '点击展开')],
    ['div', {}, 0],
  ],
});
type Options = {
  el: HTMLElement;
  events?: { change?: () => void };
  [key: string]: unknown;
};
/** Compatibility facade isolates the article form from the block editor runtime. */
export default class BlockEditor {
  editor: Tiptap;
  textarea: HTMLTextAreaElement;
  surface: HTMLElement;
  menu: HTMLElement;
  markdown = false;
  legacyHTML = false;
  listeners: (() => void)[] = [];
  custom = new Map<string, Function>();
  slashFrom: number | null = null;
  host: HTMLElement;
  menuIndex = 0;
  commandButtons = new Map<string, HTMLButtonElement>();
  constructor(options: Options) {
    this.host = options.el;
    const toolbar = document.createElement('div');
    toolbar.className = 'block-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '正文格式');
    const commands = [
      ['正文', 'paragraph'],
      ['一级标题', 'h1'],
      ['二级标题', 'heading'],
      ['三级标题', 'h3'],
      ['粗体', 'bold'],
      ['斜体', 'italic'],
      ['引用', 'blockquote'],
      ['列表', 'bulletList'],
      ['编号', 'orderedList'],
      ['待办', 'taskList'],
      ['代码', 'codeBlock'],
      ['分隔线', 'hr'],
      ['表格', 'table'],
      ['链接', 'link'],
      ['图片', 'image'],
      ['提示块', 'callout'],
      ['折叠块', 'fold'],
      ['清除文字格式', 'clearFormat'],
      ['撤销', 'undo'],
      ['重做', 'redo'],
    ];
    this.surface = document.createElement('div');
    this.surface.className = 'block-surface toastui-editor-ww-container';
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'block-markdown';
    this.textarea.hidden = true;
    this.textarea.setAttribute('aria-label', 'Markdown 源文');
    this.menu = document.createElement('div');
    this.menu.className = 'block-menu';
    this.menu.hidden = true;
    this.menu.setAttribute('role', 'menu');
    options.el.replaceChildren(toolbar, this.surface, this.textarea, this.menu);
    options.el.classList.add('block-editor');
    this.editor = new Tiptap({
      element: this.surface,
      extensions: [
        StarterKit,
        Callout,
        Fold,
        Placeholder.configure({
          placeholder: '写下你的想法，输入 / 插入内容…',
        }),
        Image,
        TableKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        Markdown,
      ],
      editorProps: {
        attributes: {
          class: 'toastui-editor-contents block-document',
          'aria-label': '文章正文',
        },
        handlePaste: (_view, event) => {
          if (this.editor.isActive('codeBlock')) return false;
          const text = event.clipboardData?.getData('text/plain') || '';
          if (
            !event.clipboardData?.getData('text/html') &&
            text.includes('\n') &&
            /(^|\n)(#{1,6} |```|[-*] |1\. )/.test(text)
          ) {
            event.preventDefault();
            this.editor.commands.insertContent(text, {
              contentType: 'markdown',
            });
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          if (event.isComposing) return false;
          if (
            !this.menu.hidden &&
            ['Escape', 'Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)
          ) {
            event.preventDefault();
            if (event.key === 'Escape') {
              this.closeMenu();
              return true;
            }
            if (event.key === 'Enter')
              this.menu
                .querySelectorAll<HTMLButtonElement>('button')
                [this.menuIndex]?.click();
            else this.moveMenuSelection(event.key === 'ArrowDown' ? 1 : -1);
            return true;
          }
          if (event.key === 'Enter' && this.handleBlockShortcut()) return true;
          return false;
        },
      },
      onUpdate: () => {
        options.events?.change?.();
        this.listeners.forEach((fn) => fn());
        this.updateSlash(commands);
      },
    });
    for (const [label, command, title] of [
      ['B', 'bold', '粗体'],
      ['I', 'italic', '斜体'],
      ['❝', 'blockquote', '引用'],
      ['☷', 'bulletList', '无序列表'],
      ['1.', 'orderedList', '有序列表'],
      ['☑', 'taskList', '待办'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.onmousedown = (e) => e.preventDefault();
      button.onclick = () =>
        this.exec(command, command === 'heading' ? { level: 2 } : undefined);
      this.commandButtons.set(command, button);
      toolbar.append(button);
    }
    const blockType = document.createElement('select');
    blockType.className = 'block-type';
    blockType.setAttribute('aria-label', '当前块类型');
    for (const [value, label] of [
      ['paragraph', '正文'],
      ['h1', '标题 1'],
      ['heading', '标题 2'],
      ['h3', '标题 3'],
      ['blockquote', '引用'],
      ['codeBlock', '代码块'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      blockType.append(option);
    }
    blockType.onchange = () => this.exec(blockType.value);
    toolbar.prepend(blockType);
    const syncToolbar = () => {
      for (const [command, button] of this.commandButtons) {
        const active = this.editor.isActive(command);
        button.setAttribute('aria-pressed', String(active));
      }
      blockType.value = this.editor.isActive('heading')
        ? { 1: 'h1', 2: 'heading', 3: 'h3' }[
            this.editor.getAttributes('heading').level as 1 | 2 | 3
          ] || 'heading'
        : this.editor.isActive('codeBlock')
          ? 'codeBlock'
          : this.editor.isActive('blockquote')
            ? 'blockquote'
            : 'paragraph';
    };
    this.editor.on('transaction', syncToolbar);
    syncToolbar();
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = '＋';
    more.title = '插入更多内容';
    more.setAttribute('aria-label', '插入更多内容');
    more.onmousedown = (e) => e.preventDefault();
    more.onclick = () => {
      if (!this.menu.hidden) {
        this.menu.hidden = true;
        return;
      }
      this.slashFrom = null;
      this.menu.replaceChildren();
      for (const [label, command] of commands) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.onclick = () => {
          this.menu.hidden = true;
          this.exec(command);
        };
        button.onmousedown = (event) => event.preventDefault();
        this.menu.append(button);
      }
      this.menu.style.top = '45px';
      this.menu.style.left = '8px';
      this.menu.hidden = false;
      this.menuIndex = 0;
      this.moveMenuSelection(0);
    };
    toolbar.append(more);
    const bubble = document.createElement('div');
    bubble.className = 'block-bubble';
    bubble.hidden = true;
    options.el.append(bubble);
    for (const [label, command] of [
      ['B', 'bold'],
      ['I', 'italic'],
      ['链接', 'link'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => this.exec(command);
      bubble.append(b);
    }
    this.editor.on('selectionUpdate', () => {
      const selection = this.editor.state.selection;
      bubble.hidden =
        !this.editor.isFocused ||
        selection.empty ||
        !this.editor.state.doc.textBetween(selection.from, selection.to).trim();
      if (!bubble.hidden) {
        const rect = this.editor.view.coordsAtPos(
          this.editor.state.selection.from,
        );
        const host = this.host.getBoundingClientRect();
        bubble.style.top = `${rect.top - host.top - 44 < 44 ? rect.bottom - host.top + 8 : rect.top - host.top - 44}px`;
        bubble.style.left = `${Math.min(Math.max(8, rect.left - host.left), Math.max(8, this.host.clientWidth - 150))}px`;
      }
    });
    this.editor.on('blur', () => {
      bubble.hidden = true;
    });
    this.host.addEventListener('pointerdown', (event) => {
      if (
        !(event.target as HTMLElement).closest(
          '.block-toolbar,.block-menu,.block-controls',
        )
      )
        this.menu.hidden = true;
    });
    this.surface.addEventListener('mousedown', (e) => {
      const last = this.editor.view.dom.lastElementChild;
      if (
        e.target === this.surface ||
        (e.target === this.editor.view.dom &&
          last &&
          e.clientY > last.getBoundingClientRect().bottom + 8)
      ) {
        e.preventDefault();
        if (this.editor.state.doc.lastChild?.type.name !== 'paragraph')
          this.editor.commands.insertContentAt(
            this.editor.state.doc.content.size,
            { type: 'paragraph' },
          );
        this.editor.commands.focus('end');
        this.exec('clearFormat');
      }
    });
    this.textarea.oninput = () => {
      options.events?.change?.();
      this.listeners.forEach((fn) => fn());
    };
    const tools = document.createElement('div');
    tools.className = 'block-controls';
    tools.hidden = true;
    options.el.append(tools);
    options.el.addEventListener('mouseleave', () => (tools.hidden = true));
    let position = 0,
      dragPosition: number | null = null;
    const actions: [string, () => void][] = [
      [
        '＋',
        () => {
          this.editor
            .chain()
            .focus()
            .insertContentAt(position, '<p>/</p>')
            .run();
        },
      ],
      ['转换类型', () => this.convertBlock(position)],
      ['↑', () => this.moveBlock(position, -1)],
      ['↓', () => this.moveBlock(position, 1)],
      [
        '复制',
        () => {
          const node = this.editor.state.doc.nodeAt(position);
          if (node)
            this.editor
              .chain()
              .focus()
              .insertContentAt(position + node.nodeSize, node.toJSON())
              .run();
        },
      ],
      [
        '删除',
        () => {
          const node = this.editor.state.doc.nodeAt(position);
          if (node)
            this.editor
              .chain()
              .focus()
              .deleteRange({ from: position, to: position + node.nodeSize })
              .run();
        },
      ],
    ];
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.textContent = '⠿';
    grip.title = '拖动此块';
    grip.draggable = true;
    grip.ondragend = () => {
      dragPosition = null;
      tools.hidden = true;
    };
    grip.ondragstart = (e) => {
      dragPosition = position;
      e.dataTransfer?.setData('text/plain', 'block');
    };
    tools.append(grip);
    const optionsButton = document.createElement('button');
    optionsButton.type = 'button';
    optionsButton.className = 'block-options';
    optionsButton.textContent = '⋯';
    optionsButton.title = '块操作';
    optionsButton.onclick = () => tools.classList.toggle('expanded');
    tools.append(optionsButton);
    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onmousedown = (e) => e.preventDefault();
      button.onclick = () => {
        action();
        tools.hidden = true;
        tools.classList.remove('expanded');
      };
      tools.append(button);
    }
    this.surface.addEventListener('mousemove', (event) => {
      const target = (event.target as HTMLElement).closest(
        '.block-document > *',
      );
      if (!target) return;
      position = this.editor.view.posAtDOM(target, 0);
      const resolved = this.editor.state.doc.resolve(
        Math.min(position, this.editor.state.doc.content.size),
      );
      if (resolved.depth) position = resolved.before(1);
      tools.hidden = false;
      const rect = target.getBoundingClientRect();
      const host = options.el.getBoundingClientRect();
      tools.style.top = `${rect.top - host.top}px`;
    });
    this.surface.addEventListener('dragover', (e) => {
      if (dragPosition !== null) e.preventDefault();
    });
    this.surface.addEventListener(
      'drop',
      (event) => {
        if (dragPosition === null) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const hit = this.editor.view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        const source = dragPosition;
        dragPosition = null;
        if (!hit) return;
        const node = this.editor.state.doc.nodeAt(source);
        if (!node) return;
        const resolved = this.editor.state.doc.resolve(hit.pos);
        const dest = resolved.depth ? resolved.before(1) : hit.pos;
        if (dest >= source && dest <= source + node.nodeSize) return;
        const tr = this.editor.state.tr.delete(source, source + node.nodeSize);
        tr.insert(dest > source ? dest - node.nodeSize : dest, node);
        this.editor.view.dispatch(tr);
      },
      true,
    );
  }
  moveBlock(position: number, direction: number) {
    const { doc, tr } = this.editor.state;
    const node = doc.nodeAt(position);
    if (!node) return;
    const resolved = doc.resolve(position);
    const index = resolved.index(0);
    if (direction < 0 && index > 0) {
      const previous = doc.child(index - 1);
      this.editor.view.dispatch(
        tr
          .delete(position, position + node.nodeSize)
          .insert(position - previous.nodeSize, node),
      );
    } else if (direction > 0 && index < doc.childCount - 1) {
      const next = doc.child(index + 1);
      this.editor.view.dispatch(
        tr
          .delete(position, position + node.nodeSize)
          .insert(position + next.nodeSize, node),
      );
    }
  }
  convertBlock(position: number) {
    let node = this.editor.state.doc.nodeAt(position);
    if (!node) return;
    let cursor = position;
    while (!node.isTextblock && node.firstChild) {
      cursor++;
      node = node.firstChild;
    }
    if (!node.isTextblock) return;
    this.editor.commands.setTextSelection(cursor + 1);
    const dialog = document.createElement('dialog');
    dialog.className = 'block-panel';
    const title = document.createElement('h3');
    title.textContent = '转换块类型';
    dialog.append(title);
    for (const [label, command] of [
      ['正文', 'paragraph'],
      ['一级标题', 'h1'],
      ['二级标题', 'heading'],
      ['三级标题', 'h3'],
      ['引用', 'blockquote'],
      ['无序列表', 'bulletList'],
      ['有序列表', 'orderedList'],
      ['待办列表', 'taskList'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = () => {
        this.exec(command);
        dialog.close();
      };
      dialog.append(button);
    }
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  }
  updateSlash(commands: string[][]) {
    if (this.editor.isActive('codeBlock') || this.editor.view.composing) {
      this.menu.hidden = true;
      return;
    }
    const { selection } = this.editor.state;
    const text = selection.$from.parent.textContent;
    const match = /^\/([^\s]*)$/.exec(text);
    if (!match) {
      this.menu.hidden = true;
      this.slashFrom = null;
      return;
    }
    this.slashFrom = selection.$from.start();
    this.menu.replaceChildren();
    commands
      .filter(([label, cmd]) =>
        `${label} ${cmd}`.toLowerCase().includes(match[1].toLowerCase()),
      )
      .forEach(([label, cmd], index) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.id = `block-command-${index}`;
        b.onmousedown = (event) => event.preventDefault();
        b.textContent = label;
        b.onclick = () => {
          if (this.slashFrom !== null)
            this.editor
              .chain()
              .focus()
              .deleteRange({
                from: this.slashFrom,
                to: this.editor.state.selection.from,
              })
              .run();
          this.menu.hidden = true;
          this.exec(cmd, cmd === 'heading' ? { level: 2 } : undefined);
        };
        b.onkeydown = (e) => {
          if (e.key === 'Escape') {
            this.menu.hidden = true;
            this.editor.commands.focus();
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const all = this.menu.querySelectorAll<HTMLButtonElement>('button');
            all[
              (index + (e.key === 'ArrowDown' ? 1 : all.length - 1)) %
                all.length
            ]?.focus();
          }
        };
        this.menu.append(b);
      });
    this.menuIndex = 0;
    this.menu.hidden = !this.menu.children.length;
    this.moveMenuSelection(0);
    if (!this.menu.hidden) {
      const caret = this.editor.view.coordsAtPos(selection.from);
      const host = this.host.getBoundingClientRect();
      this.menu.style.top = `${caret.bottom - host.top + 8}px`;
      this.menu.style.left = `${Math.max(0, Math.min(caret.left - host.left, this.host.clientWidth - 230))}px`;
    }
  }
  closeMenu() {
    this.menu.hidden = true;
    this.slashFrom = null;
    this.editor.view.dom.removeAttribute('aria-activedescendant');
  }
  moveMenuSelection(delta: number) {
    const buttons = Array.from(
      this.menu.querySelectorAll<HTMLButtonElement>('button'),
    );
    if (!buttons.length) return;
    this.menuIndex = (this.menuIndex + delta + buttons.length) % buttons.length;
    buttons.forEach((button, index) => {
      button.classList.toggle('is-active', index === this.menuIndex);
      button.setAttribute('aria-current', String(index === this.menuIndex));
    });
    const active = buttons[this.menuIndex];
    if (active.id)
      this.editor.view.dom.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView?.({ block: 'nearest' });
  }
  handleBlockShortcut() {
    const e = this.editor,
      { selection } = e.state;
    if (
      !selection.empty ||
      e.isActive('codeBlock') ||
      !selection.$from.parent.isTextblock
    )
      return false;
    const text = selection.$from.parent.textContent,
      start = selection.$from.start();
    if (selection.$from.parentOffset !== text.length) return false;
    const fence = /^```([\w+-]*)$/.exec(text);
    const heading = /^(#{1,6})\s*(\S.*)$/.exec(text);
    if (fence) {
      const chain = e.chain().deleteRange({ from: start, to: selection.from });
      if (fence[1]) chain.setCodeBlock({ language: fence[1] }).run();
      else chain.setCodeBlock().run();
      return true;
    }
    if (/^[-*_]{3,}$/.test(text)) {
      e.chain()
        .deleteRange({ from: start, to: selection.from })
        .setHorizontalRule()
        .run();
      return true;
    }
    if (heading && e.isActive('paragraph')) {
      e.chain()
        .deleteRange({
          from: start,
          to: start + text.length - heading[2].length,
        })
        .setHeading({ level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6 })
        .run();
      e.commands.splitBlock();
      return true;
    }
    return false;
  }
  on(_name: string, fn: () => void) {
    this.listeners.push(fn);
  }
  addCommand(_type: string, name: string, fn: Function) {
    this.custom.set(name, fn);
  }
  exec(name: string, payload?: Record<string, any>) {
    const e = this.editor;
    const c = e.chain().focus();
    if (this.custom.has(name)) {
      this.custom.get(name)!(payload || {}, e.state, e.view.dispatch, e.view);
      return;
    }
    switch (name) {
      case 'h1':
        c.toggleHeading({ level: 1 }).run();
        break;
      case 'h3':
        c.toggleHeading({ level: 3 }).run();
        break;
      case 'callout':
        c.insertContent({
          type: 'callout',
          content: [{ type: 'paragraph' }],
        }).run();
        break;
      case 'fold':
        c.insertContent({
          type: 'fold',
          content: [{ type: 'paragraph' }],
        }).run();
        this.panel(
          '折叠块标题',
          [['title', '展开标题', '点击展开']],
          (values) =>
            e
              .chain()
              .focus()
              .updateAttributes('fold', { title: values.title || '点击展开' })
              .run(),
        );
        break;
      case 'heading':
        c.toggleHeading({ level: payload?.level || 2 }).run();
        break;
      case 'clearFormat':
        c.unsetAllMarks()
          .command(({ tr }) => {
            tr.setStoredMarks([]);
            return true;
          })
          .run();
        break;
      case 'undo':
        c.undo().run();
        break;
      case 'redo':
        c.redo().run();
        break;
      case 'paragraph':
        c.clearNodes().setParagraph().run();
        break;
      case 'bold':
        c.toggleBold().run();
        break;
      case 'italic':
        c.toggleItalic().run();
        break;
      case 'blockquote':
        c.toggleBlockquote().run();
        break;
      case 'bulletList':
        c.toggleBulletList().run();
        break;
      case 'orderedList':
        c.toggleOrderedList().run();
        break;
      case 'taskList':
        c.toggleTaskList().run();
        break;
      case 'codeBlock':
        c.setCodeBlock({
          language: e.getAttributes('codeBlock').language || null,
        }).run();
        this.panel(
          '代码语言',
          [
            [
              'language',
              '语言，如 sh、js、python',
              e.getAttributes('codeBlock').language || '',
            ],
          ],
          (values) => {
            e.chain()
              .focus()
              .updateAttributes('codeBlock', {
                language: values.language || null,
              })
              .run();
          },
        );
        break;
      case 'hr':
        c.setHorizontalRule().run();
        break;
      case 'table':
        this.tablePanel();
        break;
      case 'link':
        this.panel(
          '插入链接',
          [
            ['href', '链接地址', e.getAttributes('link').href || ''],
            ['text', '显示文字（未选中文字时使用）', ''],
          ],
          (values) => {
            if (this.safeUrl(values.href) && e.state.selection.empty) {
              e.chain()
                .focus()
                .insertContent({
                  type: 'text',
                  text: values.text || values.href,
                  marks: [{ type: 'link', attrs: { href: values.href } }],
                })
                .run();
              return;
            }
            if (this.safeUrl(values.href))
              e.chain()
                .focus()
                .extendMarkRange('link')
                .setLink({ href: values.href })
                .run();
          },
          () => e.chain().focus().unsetLink().run(),
        );
        break;
      case 'image':
        this.panel(
          '插入图片',
          [
            ['src', '图片地址', ''],
            ['alt', '图片说明', ''],
          ],
          (values) => {
            if (this.safeUrl(values.src))
              e.chain()
                .focus()
                .setImage({ src: values.src, alt: values.alt })
                .run();
          },
          undefined,
          true,
        );
        break;
    }
  }
  safeUrl(value: string) {
    return /^https?:\/\//.test(value) || /^\/(?!\/)/.test(value);
  }
  panel(
    title: string,
    fields: string[][],
    apply: (values: Record<string, string>) => void,
    remove?: () => void,
    image = false,
  ) {
    const dialog = document.createElement('dialog');
    dialog.className = 'block-panel';
    const form = document.createElement('form');
    const heading = document.createElement('h3');
    heading.textContent = title;
    form.append(heading);
    const inputs: HTMLInputElement[] = [];
    for (const [name, label, value] of fields) {
      const wrap = document.createElement('label');
      wrap.textContent = label;
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      inputs.push(input);
      wrap.append(input);
      form.append(wrap);
    }
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    if (image) {
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/jpeg,image/png,image/webp,image/gif';
      file.onchange = async () => {
        if (!file.files?.[0]) return;
        const data = new FormData();
        data.append('file', file.files[0]);
        message.textContent = '正在上传…';
        try {
          const r = await fetch('/api/admin/media', {
            method: 'POST',
            body: data,
          });
          const result = await r.json();
          if (!r.ok) throw Error(result.error);
          inputs[0].value = result.url;
          message.textContent = '已上传，点击应用插入';
        } catch (e) {
          message.textContent = (e as Error).message;
        }
      };
      form.append(file);
    }
    const actions = document.createElement('footer');
    for (const [label, action] of [
      ['取消', () => dialog.close()],
      ...(remove
        ? [
            [
              '移除链接',
              () => {
                remove();
                dialog.close();
              },
            ],
          ]
        : []),
    ] as [string, () => void][]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = action;
      actions.append(b);
    }
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '应用';
    actions.append(submit);
    form.append(message, actions);
    form.onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(
        inputs.map((input) => [input.name, input.value.trim()]),
      );
      if (
        ('href' in values && !this.safeUrl(values.href)) ||
        ('src' in values && !this.safeUrl(values.src))
      ) {
        message.textContent = '请输入 HTTP/S 或站内路径';
        return;
      }
      apply(values);
      dialog.close();
    };
    dialog.append(form);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
    inputs[0]?.focus();
  }
  tablePanel() {
    const e = this.editor;
    this.panel(
      '表格设置',
      [
        ['rows', '行数（1–20）', '3'],
        ['cols', '列数（1–12）', '3'],
      ],
      (values) => {
        if (e.isActive('table')) return;
        e.chain()
          .focus()
          .insertTable({
            rows: Math.max(1, Math.min(20, Number(values.rows) || 3)),
            cols: Math.max(1, Math.min(12, Number(values.cols) || 3)),
            withHeaderRow: true,
          })
          .run();
      },
    );
    const form = document.querySelector('.block-panel form')!;
    if (e.isActive('table'))
      for (const [label, command] of [
        ['增加行', 'addRowAfter'],
        ['增加列', 'addColumnAfter'],
        ['删除行', 'deleteRow'],
        ['删除列', 'deleteColumn'],
        ['删除表格', 'deleteTable'],
      ] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.onclick = () => {
          e.chain().focus()[command]().run();
          (form.closest('dialog') as HTMLDialogElement).close();
        };
        form.append(b);
      }
  }
  getMarkdown() {
    if (this.legacyHTML)
      return (
        new DOMParser().parseFromString(this.textarea.value, 'text/html').body
          .textContent || ''
      );
    if (this.markdown) return this.textarea.value;
    try {
      return this.editor.getMarkdown();
    } catch {
      return this.editor.getText();
    }
  }
  getHTML() {
    if (this.legacyHTML) return this.textarea.value;
    if (this.markdown)
      this.editor.commands.setContent(this.textarea.value, {
        contentType: 'markdown',
        emitUpdate: false,
      });
    return this.editor.getHTML();
  }
  getJSON() {
    if (this.legacyHTML) return undefined;
    return this.editor.getJSON();
  }
  setJSON(value: any) {
    const markdown = this.markdown;
    this.legacyHTML = false;
    this.markdown = false;
    try {
      this.editor.commands.setContent(value, { errorOnInvalidContent: true });
      this.textarea.value = this.editor.getMarkdown();
    } finally {
      this.markdown = markdown;
      this.surface.hidden = markdown;
      this.textarea.hidden = !markdown;
      this.host.querySelector<HTMLElement>('.block-toolbar')!.hidden = false;
    }
  }
  setLegacyHTML(value: string) {
    this.legacyHTML = true;
    this.markdown = false;
    this.textarea.value = value;
    this.textarea.hidden = false;
    this.textarea.setAttribute('aria-label', 'HTML 兼容源文');
    this.surface.hidden = true;
    this.host.querySelector<HTMLElement>('.block-toolbar')!.hidden = true;
  }
  setMarkdown(value: string, _focus?: boolean) {
    this.legacyHTML = false;
    this.host.querySelector<HTMLElement>('.block-toolbar')!.hidden = false;
    this.surface.hidden = this.markdown;
    this.textarea.hidden = !this.markdown;
    this.textarea.value = value;
    this.editor.commands.setContent(value, { contentType: 'markdown' });
  }
  setHTML(value: string, _focus?: boolean) {
    const markdown = this.markdown;
    this.legacyHTML = false;
    this.markdown = false;
    try {
      this.editor.commands.setContent(value);
      this.textarea.value = this.editor.getMarkdown();
    } finally {
      this.markdown = markdown;
      this.surface.hidden = markdown;
      this.textarea.hidden = !markdown;
      this.host.querySelector<HTMLElement>('.block-toolbar')!.hidden = false;
    }
  }
  isMarkdownMode() {
    return this.markdown || this.legacyHTML;
  }
  changeMode(mode: string, _focus?: boolean) {
    if (this.legacyHTML) {
      const value = this.textarea.value;
      this.legacyHTML = false;
      this.editor.commands.setContent(value, { emitUpdate: false });
      this.host.querySelector<HTMLElement>('.block-toolbar')!.hidden = false;
    }
    const markdown = mode === 'markdown';
    if (markdown && !this.markdown) this.textarea.value = this.getMarkdown();
    else if (!markdown && this.markdown)
      this.editor.commands.setContent(this.textarea.value, {
        contentType: 'markdown',
      });
    this.markdown = markdown;
    this.textarea.hidden = !markdown;
    this.surface.hidden = markdown;
    if (markdown) this.textarea.focus();
    else this.editor.commands.focus();
  }
  focus() {
    this.editor.commands.focus();
  }
  moveCursorToEnd(_focus?: boolean) {
    this.editor.commands.focus('end');
  }
  getSelection(): [number, number] {
    return [this.editor.state.selection.from, this.editor.state.selection.to];
  }
  setSelection(from: number, to: number) {
    this.editor.commands.setTextSelection({ from, to });
  }
  replaceSelection(value: string) {
    this.editor.commands.insertContent(value || '');
    if (!value) this.editor.commands.deleteSelection();
  }
}

import { describe, it, expect } from 'vitest';
import { POST, PATCH } from '../src/pages/api/admin/posts';
import { getArticleBySlug, getHomeArticles } from '../src/services/articles';

function context(body: unknown, authenticated = true) {
  return {
    url: new URL('http://localhost/api/admin/posts'),
    request: new Request('http://localhost/api/admin/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    session: {
      get: async () => (authenticated ? { id: 1, username: 'admin' } : null),
      destroy: () => {},
    },
  } as any;
}
describe('original article publishing', () => {
  it('isolates editing drafts from published content and rejects stale saves', async () => {
    const body = {
      title: '公开版本',
      slug: 'draft-isolation',
      summary: '',
      tags: '',
      cover: '',
      content: '<p>公开正文</p>',
      publish: true,
    };
    const post = await (await POST(context(body))).json();
    const blocks = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '草稿正文' }] },
      ],
    };
    const draft = await POST(
      context({
        ...body,
        id: post.id,
        title: '编辑草稿',
        content: '<p>草稿正文</p>',
        blocks,
        publish: false,
        draftOnly: true,
        draftVersion: 0,
      }),
    );
    expect(draft.status).toBe(200);
    expect((await draft.json()).draftVersion).toBe(1);
    expect(getArticleBySlug(body.slug)?.title).toBe('公开版本');
    expect(
      (
        await POST(
          context({ ...body, id: post.id, draftOnly: true, draftVersion: 0 }),
        )
      ).status,
    ).toBe(409);
    const publish = await POST(
      context({
        ...body,
        id: post.id,
        title: '更新版本',
        blocks,
        draftVersion: 1,
      }),
    );
    expect(publish.status).toBe(200);
    expect(getArticleBySlug(body.slug)?.title).toBe('更新版本');
    expect(JSON.parse((await publish.json()).contentJson).document).toEqual(
      blocks,
    );
    expect(
      (
        await POST(
          context({
            ...body,
            id: post.id,
            baseVersion: 0,
            draftVersion: 0,
            draftOnly: true,
          }),
        )
      ).status,
    ).toBe(409);
    const edited = await POST(
      context({
        ...body,
        id: post.id,
        title: '列表发布草稿',
        draftOnly: true,
        baseVersion: 1,
        draftVersion: 0,
      }),
    );
    expect(edited.status).toBe(200);
    expect(
      (await PATCH(context({ ids: [post.id], action: 'publish' }))).status,
    ).toBe(200);
    expect(getArticleBySlug(body.slug)?.title).toBe('列表发布草稿');
  });
  it('saves private drafts, publishes, edits and withdraws articles', async () => {
    const body = {
      title: '原创测试',
      slug: 'original-test',
      summary: '摘要',
      tags: '生活,技术',
      categories: '随笔,技术',
      cover: '',
      content: '<h2>标题</h2><p>正文</p><script>alert(1)</script>',
      markdown: '## 标题\n\n正文',
      publish: false,
    };
    const draft = await POST(context(body));
    expect(draft.status).toBe(200);
    const saved = await draft.json();
    expect(getArticleBySlug(body.slug)).toBeNull();
    expect(saved.contentHtml).not.toContain('<script');
    expect(saved.contentMarkdown).toBe(body.markdown);
    expect(JSON.parse(saved.categoriesJson)).toEqual(['随笔', '技术']);
    const published = await POST(
      context({ ...body, id: saved.id, publish: true }),
    );
    expect(published.status).toBe(200);
    expect(getArticleBySlug(body.slug)?.title).toBe(body.title);
    expect(getHomeArticles().latest.some((a) => a.slug === body.slug)).toBe(
      true,
    );
    await POST(
      context({ ...body, id: saved.id, title: '修改后的标题', publish: true }),
    );
    expect(getArticleBySlug(body.slug)?.title).toBe('修改后的标题');
    await POST(context({ ...body, id: saved.id, publish: false }));
    expect(getArticleBySlug(body.slug)).toBeNull();
  });
  it('rejects anonymous writes', async () => {
    expect((await POST(context({}, false))).status).toBe(401);
  });
  it('manages publication, recoverable trash and duplication', async () => {
    const response = await POST(
      context({
        title: '管理测试',
        slug: 'management-test',
        summary: '管理摘要',
        tags: '测试',
        cover: '',
        content: '<p>正文</p>',
        markdown: '正文',
        publish: true,
      }),
    );
    const post = await response.json();
    const action = (action: string) =>
      PATCH(context({ ids: [post.id], action }));
    expect((await action('trash')).status).toBe(200);
    expect(getArticleBySlug(post.slug)).toBeNull();
    expect((await action('publish')).status).toBe(409);
    expect((await action('restore')).status).toBe(200);
    expect(getArticleBySlug(post.slug)).toBeNull();
    expect((await action('publish')).status).toBe(200);
    expect(getArticleBySlug(post.slug)).not.toBeNull();
    expect((await action('pin')).status).toBe(200);
    expect(getArticleBySlug(post.slug)?.pinned).toBe(true);
    expect((await action('duplicate')).status).toBe(200);
    expect(
      (await PATCH(context({ ids: [post.id, 999999], action: 'trash' })))
        .status,
    ).toBe(404);
    expect(getArticleBySlug(post.slug)).not.toBeNull();
  });
});

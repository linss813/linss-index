import { describe, it, expect } from 'vitest';
import { POST } from '../src/pages/api/comments';
import { POST as manage } from '../src/pages/api/admin/community';
import { sqlite } from '../src/lib/db';
import { initCommunity, publicCommentThreads } from '../src/services/community';
function ctx(body: unknown, origin = 'http://localhost') {
  return {
    url: new URL('http://localhost/api/comments'),
    clientAddress: 'test-community',
    request: new Request('http://localhost/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin },
      body: JSON.stringify(body),
    }),
    session: { get: async () => null },
  } as any;
}
describe('community privacy and moderation', () => {
  it('paginates complete public threads without exposing email or hidden replies', () => {
    const moment = Number(
      sqlite
        .prepare("INSERT INTO moments(content,visible) VALUES('分页测试',1)")
        .run().lastInsertRowid,
    );
    const roots: number[] = [];
    for (let i = 0; i < 12; i++)
      roots.push(
        Number(
          sqlite
            .prepare(
              "INSERT INTO comments(moment_id,name,content,email,approved) VALUES(?,'来访者',?,'private@example.com',1)",
            )
            .run(moment, '主楼' + i).lastInsertRowid,
        ),
      );
    sqlite
      .prepare(
        "INSERT INTO comments(moment_id,parent_id,name,content,email,approved) VALUES(?,?,'回复者','公开回复','hidden@example.com',1)",
      )
      .run(moment, roots[11]);
    sqlite
      .prepare(
        "INSERT INTO comments(moment_id,parent_id,name,content,approved) VALUES(?,?,'隐藏回复','不公开',0)",
      )
      .run(moment, roots[11]);
    const page = publicCommentThreads(null, moment, 1);
    expect(page.total).toBe(12);
    expect(page.rows).toHaveLength(11);
    expect(JSON.stringify(page.rows)).not.toContain('@example.com');
    expect(JSON.stringify(page.rows)).not.toContain('不公开');
    expect(publicCommentThreads(null, moment, 2).rows).toHaveLength(2);
  });

  it('keeps moment replies separate from guestbook and preserves a deleted floor', async () => {
    const moment = Number(
      sqlite
        .prepare("INSERT INTO moments(content,visible) VALUES('图片动态',1)")
        .run().lastInsertRowid,
    );
    const root = Number(
      sqlite
        .prepare(
          "INSERT INTO comments(moment_id,name,content,approved) VALUES(?,'楼主','动态回复',1)",
        )
        .run(moment).lastInsertRowid,
    );
    const invalid = ctx({
      name: '访客',
      content: '不能串楼',
      articleId: null,
      parentId: root,
    });
    invalid.clientAddress = 'moment-cross';
    expect((await POST(invalid)).status).toBe(400);
    const valid = ctx({
      name: '访客',
      content: '动态楼内',
      articleId: null,
      momentId: moment,
      parentId: root,
    });
    valid.clientAddress = 'moment-valid';
    expect((await POST(valid)).status).toBe(200);
    const admin = ctx({ action: 'delete-comment', id: root });
    admin.session.get = async () => ({ id: 1, username: 'admin' });
    expect((await manage(admin)).status).toBe(200);
    expect(
      sqlite.prepare('SELECT deleted FROM comments WHERE id=?').get(root),
    ).toEqual({ deleted: 1 });
    expect(
      (
        sqlite
          .prepare('SELECT parent_id FROM comments ORDER BY id DESC LIMIT 1')
          .get() as any
      ).parent_id,
    ).toBe(root);
  });
  it('accepts optional contact fields and replies only to public comments in the same section', async () => {
    initCommunity();
    const parent = sqlite
      .prepare('INSERT INTO comments(name,content,approved) VALUES(?,?,1)')
      .run('楼主', '公开留言');
    const c = ctx({
      name: '回复者',
      content: '楼内回复',
      email: 'guest@example.com',
      website: 'https://example.com',
      articleId: null,
      parentId: Number(parent.lastInsertRowid),
    });
    c.clientAddress = 'reply-test';
    expect((await POST(c)).status).toBe(200);
    const row = sqlite
      .prepare(
        'SELECT parent_id,email,website,avatar,approved FROM comments ORDER BY id DESC LIMIT 1',
      )
      .get() as any;
    expect(row.parent_id).toBe(Number(parent.lastInsertRowid));
    expect(row.email).toBe('guest@example.com');
    expect(row.avatar).toMatch(/^[a-f0-9]{16}$/);
    expect(row.approved).toBe(0);
    const invalid = ctx({
      name: '回复者',
      content: '不能回复待审核评论',
      articleId: null,
      parentId: Number(parent.lastInsertRowid) + 1,
    });
    invalid.clientAddress = 'invalid-reply';
    expect((await POST(invalid)).status).toBe(400);
  });
  it('rejects replies below a hidden ancestor', async () => {
    const root = Number(
      sqlite
        .prepare(
          "INSERT INTO comments(name,content,approved) VALUES('隐藏楼主','根留言',0)",
        )
        .run().lastInsertRowid,
    );
    const child = Number(
      sqlite
        .prepare(
          "INSERT INTO comments(name,content,approved,parent_id) VALUES('回复者','子留言',1,?)",
        )
        .run(root).lastInsertRowid,
    );
    const request = ctx({
      name: '访客',
      content: '不能回复隐藏整楼',
      articleId: null,
      parentId: child,
    });
    request.clientAddress = 'hidden-root';
    expect((await POST(request)).status).toBe(400);
  });
  it('rejects unsafe website links and malformed email', async () => {
    expect(
      (
        await POST(
          ctx({
            name: '访客',
            content: '文本',
            articleId: null,
            website: 'javascript:alert(1)',
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          ctx({
            name: '访客',
            content: '文本',
            articleId: null,
            email: 'invalid',
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('rejects cross-origin and anonymous management', async () => {
    expect((await POST(ctx({}, 'https://other.example'))).status).toBe(403);
    expect(
      (await manage(ctx({ action: 'moment', content: 'test' }))).status,
    ).toBe(401);
  });
  it('stores guestbook submissions pending review and limits repetition', async () => {
    initCommunity();
    const response = await POST(
      ctx({ name: '访客', content: '测试留言', articleId: null }),
    );
    expect(response.status).toBe(200);
    const row = sqlite
      .prepare(
        'SELECT approved,article_id FROM comments ORDER BY id DESC LIMIT 1',
      )
      .get() as any;
    expect(row.approved).toBe(0);
    expect(row.article_id).toBeNull();
    expect(
      (await POST(ctx({ name: '访客', content: '重复留言', articleId: null })))
        .status,
    ).toBe(429);
  });
  it('rejects invalid input', async () => {
    expect(
      (await POST(ctx({ name: '', content: 'x', articleId: null }))).status,
    ).toBe(400);
  });
});

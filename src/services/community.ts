import { sqlite } from '../lib/db';
/** Schema is created by db:init, never by rendering a public page. */
export function initCommunity() {}
/** Every ancestor must be public; a hidden root hides the whole conversation. */
export function canReplyTo(
  id: number,
  articleId: number | null,
  momentId: number | null,
) {
  let current: number | null = id;
  const visited = new Set<number>();
  while (current !== null) {
    if (visited.has(current) || visited.size >= 100) return false;
    visited.add(current);
    const row = sqlite
      .prepare(
        'SELECT parent_id,approved,deleted FROM comments WHERE id=? AND article_id IS ? AND moment_id IS ?',
      )
      .get(current, articleId, momentId) as
      | { parent_id: number | null; approved: number; deleted: number }
      | undefined;
    if (!row || !row.approved || (current === id && row.deleted)) return false;
    current = row.parent_id;
  }
  return true;
}
export type Moment = {
  id: number;
  content: string;
  images_json: string;
  link: string;
  tags: string;
  pinned: number;
  created_at: string;
  visible: number;
  deleted_at: string | null;
};
export function moments(limit = 10) {
  return sqlite
    .prepare(
      'SELECT * FROM moments WHERE visible=1 AND deleted_at IS NULL ORDER BY pinned DESC,id DESC LIMIT ?',
    )
    .all(limit) as Moment[];
}
export function communitySettings() {
  const row = sqlite
    .prepare('SELECT value FROM settings WHERE key=?')
    .get('community_display') as { value: string } | undefined;
  try {
    return {
      home: true,
      blog: true,
      limit: 3,
      ...JSON.parse(row?.value || '{}'),
    };
  } catch {
    return { home: true, blog: true, limit: 3 };
  }
}

export type PublicComment = {
  id: number;
  parent_id: number | null;
  name: string;
  content: string;
  website: string;
  avatar: string;
  is_admin: number;
  created_at: string;
  deleted: number;
};
/** Page complete threads and select only public fields, never email addresses. */
export function publicCommentThreads(
  articleId: number | null,
  momentId: number | null,
  requestedPage = 1,
) {
  const total = (
    sqlite
      .prepare(
        'SELECT count(*) n FROM comments WHERE article_id IS ? AND moment_id IS ? AND approved=1 AND parent_id IS NULL',
      )
      .get(articleId, momentId) as { n: number }
  ).n;
  const page = Math.max(
    1,
    Math.min(
      Math.max(1, Math.ceil(total / 10)),
      Math.floor(Number(requestedPage) || 1),
    ),
  );
  const roots = sqlite
    .prepare(
      'SELECT id FROM comments WHERE article_id IS ? AND moment_id IS ? AND approved=1 AND parent_id IS NULL ORDER BY id DESC LIMIT 10 OFFSET ?',
    )
    .all(articleId, momentId, (page - 1) * 10) as { id: number }[];
  const rows = roots.length
    ? (sqlite
        .prepare(
          `WITH RECURSIVE tree(id,depth) AS (SELECT id,0 FROM comments WHERE id IN (${roots.map(() => '?').join(',')}) UNION ALL SELECT c.id,t.depth+1 FROM comments c JOIN tree t ON c.parent_id=t.id WHERE c.approved=1 AND c.article_id IS ? AND c.moment_id IS ? AND t.depth<99) SELECT c.id,c.parent_id,c.name,c.content,c.website,c.avatar,c.is_admin,c.created_at,c.deleted FROM comments c JOIN tree t ON c.id=t.id ORDER BY c.id`,
        )
        .all(...roots.map((r) => r.id), articleId, momentId) as PublicComment[])
    : [];
  return {
    total,
    page,
    rows: rows.map((row) =>
      row.deleted
        ? { ...row, name: '已删除留言', content: '此留言已删除', website: '' }
        : row,
    ),
  };
}

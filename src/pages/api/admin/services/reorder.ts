import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, schema } from '../../../../lib/db';
import { eq } from 'drizzle-orm';
import { getSessionAdmin, clearCache } from '../../../../lib/auth';
export const POST: APIRoute = async (ctx) => {
  if (!(await getSessionAdmin(ctx)))
    return Response.json({ error: '未登录' }, { status: 401 });
  if (ctx.request.headers.get('origin') !== ctx.url.origin)
    return Response.json({ error: '请求来源不匹配' }, { status: 403 });
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const parsed = z
    .object({ ids: z.array(z.number().int().positive()).max(1000) })
    .safeParse(body);
  if (!parsed.success)
    return Response.json({ error: '排序参数错误' }, { status: 400 });
  const { ids } = parsed.data;
  const rows = db
    .select({ id: schema.services.id })
    .from(schema.services)
    .all();
  if (
    ids.length !== rows.length ||
    new Set(ids).size !== ids.length ||
    rows.some((row) => !ids.includes(row.id))
  )
    return Response.json(
      { error: '服务列表已变化，请重新载入后排序' },
      { status: 409 },
    );
  db.transaction((tx) =>
    ids.forEach((id, index) =>
      tx
        .update(schema.services)
        .set({ sortOrder: index })
        .where(eq(schema.services.id, id))
        .run(),
    ),
  );
  clearCache();
  return Response.json({ success: true });
};

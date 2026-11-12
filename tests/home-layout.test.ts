import { describe, it, expect } from 'vitest';
import {
  resolveHomeOrder,
  DEFAULT_HOME_ORDER,
  homeOrderSchema,
} from '../src/lib/home-layout';
import { POST as reorder } from '../src/pages/api/admin/services/reorder';
import { GET, PUT } from '../src/pages/api/admin/settings';
import { db, schema } from '../src/lib/db';
import { getServices } from '../src/lib/queries';
function context(
  body: unknown,
  authenticated = true,
  origin = 'http://localhost',
) {
  return {
    url: new URL('http://localhost/api/admin/services/reorder'),
    request: new Request('http://localhost/api/admin/services/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    }),
    clientAddress: 'test-order',
    session: {
      get: async () => (authenticated ? { id: 1, username: 'admin' } : null),
    },
  } as any;
}
describe('homepage ordering', () => {
  it('preserves all known modules and rejects duplicates or unknown module identities', () => {
    const reversed = [...DEFAULT_HOME_ORDER].reverse();
    expect(resolveHomeOrder(JSON.stringify(reversed))).toEqual(reversed);
    expect(resolveHomeOrder('invalid')).toEqual(DEFAULT_HOME_ORDER);
    expect(
      homeOrderSchema.safeParse([
        'writing',
        'writing',
        'services',
        'tools',
        'moments',
        'guestbook',
      ]).success,
    ).toBe(false);
  });
  it('persists a validated home module order in settings', async () => {
    const order = [...DEFAULT_HOME_ORDER].reverse();
    const response = await PUT(
      context({ home_module_order: JSON.stringify(order) }),
    );
    expect(response.status).toBe(200);
    const settings = await (await GET({} as any)).json();
    expect(JSON.parse(settings.home_module_order)).toEqual(order);
    expect(
      (await PUT(context({ home_module_order: '["tools"]' }))).status,
    ).toBe(400);
  });
  it('atomically reorders individual services and refuses stale or cross-origin lists', async () => {
    const ids = db
      .select({ id: schema.services.id })
      .from(schema.services)
      .orderBy(schema.services.sortOrder)
      .all()
      .map((row) => row.id);
    const reversed = [...ids].reverse();
    expect((await reorder(context({ ids: reversed }, false))).status).toBe(401);
    expect(
      (await reorder(context({ ids: reversed }, true, 'https://other.example')))
        .status,
    ).toBe(403);
    expect((await reorder(context({ ids: reversed }))).status).toBe(200);
    expect(getServices().map((row) => row.name)).toEqual(
      reversed
        .map((id) =>
          db
            .select()
            .from(schema.services)
            .all()
            .find((row) => row.id === id)!,
        )
        .filter((row) => row.enabled)
        .map((row) => row.name),
    );
    expect((await reorder(context({ ids: reversed.slice(1) }))).status).toBe(
      409,
    );
    expect(
      (await reorder(context({ ids: reversed.map(() => reversed[0]) }))).status,
    ).toBe(409);
  });
});

import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../src/db/ddl';
import { migratePortalLinks } from '../src/db/portal-links';
it('appends missing links without duplicates, reordering or resurrecting deleted services', () => {
  const sqlite = new Database(':memory:');
  createTables(sqlite);
  sqlite.prepare("INSERT INTO services (name,url,sort_order) VALUES ('自定义名称','https://frame.luen0511.com/',42)").run();
  expect(migratePortalLinks(sqlite)).toBe(4);
  expect(sqlite.prepare('SELECT name,sort_order FROM services WHERE sort_order=42').get()).toEqual({name:'自定义名称',sort_order:42});
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM services').get()).toEqual({n:5});
  sqlite.prepare("DELETE FROM services WHERE url='https://video.luen0511.com'").run();
  expect(migratePortalLinks(sqlite)).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM services').get()).toEqual({n:4});
  sqlite.close();
});

it('enriches placeholder descriptions and preserves owner descriptions and ordering', async () => {
  const { enrichPortalLinks } = await import('../src/db/portal-links');
  const sqlite = new Database(':memory:');
  createTables(sqlite);
  sqlite.prepare("INSERT INTO services (name,description,url,sort_order) VALUES ('Pinboard','pinboard.luen0511.com','https://pinboard.luen0511.com',7),('我的入口','我的介绍','https://frame.luen0511.com',8)").run();
  expect(enrichPortalLinks(sqlite)).toBe(1);
  expect(sqlite.prepare('SELECT name,description,sort_order FROM services WHERE sort_order=8').get()).toEqual({name:'我的入口',description:'我的介绍',sort_order:8});
  expect(sqlite.prepare('SELECT description FROM services WHERE sort_order=7').get()).toEqual({description:expect.stringContaining('实时协作')});
  expect(enrichPortalLinks(sqlite)).toBe(0);
  sqlite.close();
});

import { db, schema, sqlite } from '../lib/db';
import { createTables } from '../db/ddl';
import { syncAllRssSources } from '../services/rss-sync';

createTables(sqlite);
const count = db.select().from(schema.rssSources).all().length;
if (count === 0) {
  console.error('没有可同步的 RSS 来源，请先运行 npm run db:init 或在后台添加。');
  sqlite.close();
  process.exitCode = 1;
} else {
  const result = await syncAllRssSources();
  console.log(JSON.stringify(result, null, 2));
  sqlite.close();
  if (result.failures.length > 0) process.exitCode = 1;
}


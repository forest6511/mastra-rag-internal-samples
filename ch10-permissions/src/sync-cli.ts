import { markAcl } from "./acl.js";
import { markCanonical } from "./canonical.js";
import { pool } from "./db.js";
import { FETCHERS } from "./fetch-all.js";
import { migrate } from "./ingest.js";
import { recordFailure, syncSource, type SyncStats } from "./sync.js";

// #region main
// npm run sync            5つのサービスを全件で同期する
// npm run sync -- jira    指定したサービスだけ同期する
// 1つのサービスで取得に失敗しても、ほかのサービスは続ける。
// 失敗が1つでもあれば終了コード 1 で終わる（定時の実行で気づくため）
const only = process.argv.slice(2);
await migrate(pool);
const rows: SyncStats[] = [];
let failed = 0;
for (const [source, fetch] of Object.entries(FETCHERS)) {
  if (only.length > 0 && !only.includes(source)) continue;
  try {
    const docs = markAcl(markCanonical(await fetch()));
    rows.push(await syncSource(pool, source, docs));
  } catch (e) {
    failed++;
    await recordFailure(pool, source, e);
    console.error(`${source}: 取得に失敗。索引はそのまま: ${e}`);
  }
}
console.table(rows);
for (const r of rows.filter((r) => r.kept)) {
  console.error(`${r.source}: 元が0件のため、索引の資料を消していない`);
}
await pool.end();
process.exitCode = failed > 0 ? 1 : 0;
// #endregion

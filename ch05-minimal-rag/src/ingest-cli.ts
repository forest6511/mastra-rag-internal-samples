import { pool } from "./db.js";
import { migrate, saveDoc } from "./ingest.js";
import { confluenceDocs } from "./sources/confluence.js";

// #region main
// Confluence のスペース KANADE を取り込む
await migrate(pool);
const docs = await confluenceDocs("KANADE");
for (const d of docs) {
  const n = await saveDoc(pool, d);
  console.log(`${d.title}: ${n} チャンク`);
}
await pool.end();
// #endregion

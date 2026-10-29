import { pool } from "./db.js";
import { migrate, saveDoc } from "./ingest.js";
import { need } from "./env.js";
import { confluenceDocs } from "./sources/confluence.js";
import { githubDocs } from "./sources/github.js";

// #region main
// Confluence のスペース KANADE と、GitHub の Organization を取り込む
await migrate(pool);
const docs = [
  ...(await confluenceDocs("KANADE")),
  ...(await githubDocs(need("GH_ORG"))),
];
for (const d of docs) {
  const n = await saveDoc(pool, d);
  console.log(`${d.title}: ${n} チャンク`);
}
await pool.end();
// #endregion

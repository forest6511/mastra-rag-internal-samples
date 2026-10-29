import { pool } from "./db.js";
import { migrate, saveDoc } from "./ingest.js";
import { need } from "./env.js";
import { confluenceDocs } from "./sources/confluence.js";
import { githubDocs } from "./sources/github.js";
import { jiraDocs } from "./sources/jira.js";
import { slackPostDocs, slackThreadDocs } from "./sources/slack.js";

// #region main
// Confluence・GitHub・Jira・Slack を取り込む。
// Slack は --posts で投稿単位、指定が無ければスレッド単位で資料にする
const byPost = process.argv.includes("--posts");
const workspace = process.env.SLACK_WORKSPACE ?? "kanadeloop";
await migrate(pool);
const docs = [
  ...(await confluenceDocs("KANADE")),
  ...(await githubDocs(need("GH_ORG"))),
  ...(await jiraDocs("KAN")),
  ...(byPost
    ? await slackPostDocs(workspace)
    : await slackThreadDocs(workspace)),
];
// 今回の取り込みに無い Slack の資料を消す（投稿単位とスレッド単位を
// 切り替えたとき、前の分け方の資料が DB に残らないように）
const slackIds = docs
  .filter((d) => d.source === "slack")
  .map((d) => d.id);
await pool.query(
  "DELETE FROM documents WHERE source = 'slack' AND NOT (id = ANY($1))",
  [slackIds],
);
for (const d of docs) {
  const n = await saveDoc(pool, d);
  console.log(`${d.title}: ${n} チャンク`);
}
await pool.end();
// #endregion

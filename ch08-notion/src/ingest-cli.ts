import { markCanonical } from "./canonical.js";
import { pool } from "./db.js";
import { migrate, saveDoc } from "./ingest.js";
import { need } from "./env.js";
import { confluenceDocs } from "./sources/confluence.js";
import { githubDocs } from "./sources/github.js";
import { jiraDocs } from "./sources/jira.js";
import { notionDocs } from "./sources/notion.js";
import { slackPostDocs, slackThreadDocs } from "./sources/slack.js";

// #region main
// 5つのサービスを取り込み、canonical.yml の正本に印を付ける。
// Slack は --posts で投稿単位、指定が無ければスレッド単位で資料にする
const byPost = process.argv.includes("--posts");
const workspace = process.env.SLACK_WORKSPACE ?? "kanadeloop";
await migrate(pool);
const docs = markCanonical([
  ...(await confluenceDocs("KANADE")),
  ...(await githubDocs(need("GH_ORG"))),
  ...(await jiraDocs("KAN")),
  ...(byPost
    ? await slackPostDocs(workspace)
    : await slackThreadDocs(workspace)),
  ...(await notionDocs(need("NOTION_ROOT_PAGE"))),
]);
for (const d of docs) {
  const n = await saveDoc(pool, d);
  console.log(`${d.title}: ${n} チャンク`);
}
await pool.end();
// #endregion

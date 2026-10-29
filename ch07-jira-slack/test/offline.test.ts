import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { describe, expect, it } from "vitest";
import { answer } from "../src/agent.js";
import { embed } from "../src/embed.js";
import { migrate, saveDoc } from "../src/ingest.js";
import { docSearch, vectorSearch } from "../src/search.js";
import { confluenceDocs } from "../src/sources/confluence.js";
import { githubDocs } from "../src/sources/github.js";
import { jiraDocs } from "../src/sources/jira.js";
import {
  slackPostDocs,
  slackThreadDocs,
} from "../src/sources/slack.js";

// #region setup
// 記録した応答だけで、Slack を投稿単位とスレッド単位の2通りに取り込む
process.env.OFFLINE = "1";
const Q =
  "明日の振り返り会用に、9/15の決済が落ちた件の下書き作ってほしい。" +
  "検知から顧客への連絡まで時系列で、再発防止も入れて";

async function dbWith(byPost: boolean) {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db);
  const slack = byPost ? slackPostDocs : slackThreadDocs;
  for (const d of [
    ...(await confluenceDocs("KANADE")),
    ...(await githubDocs("kanadeloop")),
    ...(await jiraDocs("KAN")),
    ...(await slack("kanadeloop")),
  ]) {
    await saveDoc(db, d);
  }
  return db;
}
// #endregion

// #region tests
describe("障害の振り返りの下書き", () => {
  it("投稿単位では、原因の 3000ms が答えに入らない", async () => {
    const [v] = await embed([Q]);
    const db = await dbWith(true);
    const text = await answer(Q, await vectorSearch(db, v));
    expect(text).not.toContain("3000ms");
  });

  it("スレッド単位では、原因と影響の件数が入る", async () => {
    const [v] = await embed([Q]);
    const db = await dbWith(false);
    const text = await answer(Q, await vectorSearch(db, v));
    expect(text).toContain("3000ms");
    expect(text).toContain("418");
  });

  it("資料ごとにまとめると、6つの別々の資料が材料になる", async () => {
    const [v] = await embed([Q]);
    const db = await dbWith(false);
    const hits = await docSearch(db, v);
    expect(new Set(hits.map((h) => h.docId)).size).toBe(6);
    expect(await answer(Q, hits)).toContain("1時間以内");
  });
});
// #endregion

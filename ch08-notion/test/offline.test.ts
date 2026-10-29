import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { answer } from "../src/agent.js";
import { markCanonical } from "../src/canonical.js";
import { embed } from "../src/embed.js";
import { migrate, saveDoc } from "../src/ingest.js";
import { docSearch } from "../src/search.js";
import { confluenceDocs } from "../src/sources/confluence.js";
import { githubDocs } from "../src/sources/github.js";
import { jiraDocs } from "../src/sources/jira.js";
import { notionDocs } from "../src/sources/notion.js";
import { slackThreadDocs } from "../src/sources/slack.js";

// #region setup
// 記録した応答だけで5つのサービスを取り込み、正本に印を付ける
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
const ask = async (q: string) => {
  const [v] = await embed([q]);
  return answer(q, await docSearch(db, v));
};

beforeAll(async () => {
  await migrate(db);
  const docs = markCanonical([
    ...(await confluenceDocs("KANADE")),
    ...(await githubDocs("kanadeloop")),
    ...(await jiraDocs("KAN")),
    ...(await slackThreadDocs("kanadeloop")),
    ...(await notionDocs("4087551e-201a-80d7-a71a-ea04d9805912")),
  ]);
  for (const d of docs) await saveDoc(db, d);
});
// #endregion

// #region tests
describe("正本と要確認", () => {
  it("Notion の「1年」ではなく、正本の「3年」を答える", async () => {
    const q =
      "商談先にログって何年残してるか聞かれたんですけど、" +
      "1年で合ってますか？Notionで見た気がして";
    expect(await ask(q)).toContain("3年");
  });

  it("チェックシートで、資料に無い問いは要確認と担当者", async () => {
    const q = readFileSync("out/checksheet-question.txt", "utf8");
    const text = await ask(q);
    expect(text).toContain("AES-256");
    expect(text).toContain("要確認");
    expect(text).toContain("加藤");
  });
});
// #endregion

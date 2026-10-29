import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { answer, INSTRUCTIONS_CH05 } from "../src/agent.js";
import { embed } from "../src/embed.js";
import { migrate, saveDoc } from "../src/ingest.js";
import { vectorSearch } from "../src/search.js";
import { confluenceDocs } from "../src/sources/confluence.js";
import { githubDocs } from "../src/sources/github.js";

// #region setup
// 記録した応答だけで、Confluence と GitHub の2つを取り込む
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
const docs = async () => [
  ...(await confluenceDocs("KANADE")),
  ...(await githubDocs("kanadeloop")),
];

beforeAll(async () => {
  await migrate(db);
  for (const d of await docs()) await saveDoc(db, d);
});
// #endregion

// #region tests
describe("GitHub を足した RAG", () => {
  it("同じ資料を2回入れても、2回目は何もしない", async () => {
    let n = 0;
    for (const d of await docs()) n += await saveDoc(db, d);
    expect(n).toBe(0);
  });

  it("資料の日付は本文の作成日から取る", async () => {
    const res = await db.query<{ d: string }>(
      `SELECT to_char(event_date, 'YYYY-MM-DD') AS d FROM documents
        WHERE id = 'github:kanade-infra:README'`,
    );
    expect(res.rows[0].d).toBe("2026-09-01");
  });

  it("新しい日付を優先すると、新しい手順の中身まで答える", async () => {
    const q = "デプロイ手順は？";
    const [v] = await embed([q]);
    const hits = await vectorSearch(db, v);
    const before = await answer(q, hits, INSTRUCTIONS_CH05);
    const after = await answer(q, hits);
    expect(before).toContain("GitHub Actions");
    expect(before).not.toContain("タグ");
    expect(after).toContain("タグ");
  });
});
// #endregion

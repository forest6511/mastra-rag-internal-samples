import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/ingest.js";
import { confluenceDocs } from "../src/sources/confluence.js";
import { changedJql } from "../src/sources/jira.js";
import { recordFailure, syncSource } from "../src/sync.js";

// #region setup
// 記録した Confluence の応答で同期する。records/ はページを消す前、
// records-after/ は「予約 API 仕様」を消した後の応答
process.env.OFFLINE = "1";
let db: PGlite;
const pages = async (dir: string) => {
  process.env.RECORDS_DIR = dir;
  return confluenceDocs("KANADE");
};
const ids = async () =>
  (
    await db.query<{ id: string }>(
      "SELECT id FROM documents ORDER BY id",
    )
  ).rows.map((r) => r.id);

beforeEach(async () => {
  db = new PGlite({ extensions: { vector } });
  await migrate(db);
});
afterEach(() => {
  delete process.env.RECORDS_DIR;
});
// #endregion

// #region tests
describe("全件で突き合わせる同期", () => {
  it("2回回しても重複せず、2回目は作り直さない", async () => {
    const docs = await pages("records");
    const first = await syncSource(db, "confluence", docs);
    const second = await syncSource(db, "confluence", docs);
    expect(first.added).toBe(7);
    expect(second).toMatchObject({ added: 0, unchanged: 7 });
    expect(await ids()).toHaveLength(7);
  });

  it("元で消したページは、索引から消える", async () => {
    await syncSource(db, "confluence", await pages("records"));
    const after = await pages("records-after");
    const s = await syncSource(db, "confluence", after);
    expect(s).toMatchObject({ fetched: 6, deleted: 1 });
    expect(await ids()).not.toContain("confluence:688129");
  });

  // #endregion
  // #region tests-guard
  it("元が0件のときは、索引の資料を消さない", async () => {
    await syncSource(db, "confluence", await pages("records"));
    const s = await syncSource(db, "confluence", []);
    expect(s).toMatchObject({ kept: true, deleted: 0 });
    expect(await ids()).toHaveLength(7);
  });

  it("取得の失敗は、記録だけする", async () => {
    await syncSource(db, "confluence", await pages("records"));
    await recordFailure(db, "confluence", new Error("HTTP 401"));
    const st = await db.query<{ error: string }>(
      "SELECT error FROM sync_state WHERE source = 'confluence'",
    );
    expect(st.rows[0].error).toContain("HTTP 401");
    expect(await ids()).toHaveLength(7);
  });

  it("途中で止まった資料は、次の回で入れ直す", async () => {
    const docs = await pages("records");
    // チャンクを入れる前に止まった状態（ハッシュが空・チャンク無し）
    await db.query(
      `INSERT INTO documents (id, source, url, title, body, body_hash)
       VALUES ($1, 'confluence', '', '', '', '')`,
      [docs[0].id],
    );
    const s = await syncSource(db, "confluence", docs);
    expect(s).toMatchObject({ added: 6, updated: 1 });
  });
  // #endregion
  // #region tests-answer
  // 記録した答え: 消す前は予約 API 仕様を挙げ、消した後は挙げない
  it("消したページは答えの材料に入らない", () => {
    const before = readFileSync("out/api-before.txt", "utf8");
    const after = readFileSync("out/api-after.txt", "utf8");
    expect(before).toContain("予約 API 仕様");
    expect(after).not.toContain("[1] 0.686 予約 API 仕様");
    expect(after).not.toMatch(/^\[\d\] [\d.]+ 予約 API 仕様$/m);
  });
});
// #endregion

describe("差分で取るときの JQL", () => {
  it("前回の時刻から5分戻した「何分前から」で絞る", () => {
    const since = new Date("2026-10-30T00:10:00Z");
    const now = new Date("2026-10-30T01:00:00Z"); // 前回から50分
    expect(changedJql("KAN", since, now)).toBe(
      'project = KAN AND updated >= "-55m" ORDER BY updated ASC',
    );
    expect(changedJql("KAN")).toBe(
      "project = KAN ORDER BY created ASC",
    );
  });
});

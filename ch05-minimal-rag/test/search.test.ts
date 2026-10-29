import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { context } from "../src/agent.js";
import { DIMENSIONS } from "../src/embed.js";
import { migrate } from "../src/ingest.js";
import { vectorSearch } from "../src/search.js";

// PGlite は Node の中で動く PostgreSQL。pgvector の版は 0.8.7 で、
// 本番の 0.8.2 とは違うが、距離の計算と並び順は同じ
const db = new PGlite({ extensions: { vector } });

// i 番目の軸だけが 1 のベクトル（向きが決まった合成の埋め込み）
const axis = (i: number, w = 1) =>
  Array.from({ length: DIMENSIONS }, (_, j) => (j === i ? w : 0));

beforeAll(async () => {
  await migrate(db);
  const docs = [
    ["confluence:1", "デプロイ手順（本番環境）", 0],
    ["confluence:2", "セキュリティ方針", 1],
  ] as const;
  for (const [id, title, i] of docs) {
    await db.query(
      "INSERT INTO documents VALUES ($1, 'confluence', $2, $3, '')",
      [id, `https://example.com/${id}`, title],
    );
    await db.query(
      `INSERT INTO chunks (doc_id, ord, content, embedding)
       VALUES ($1, 0, $2, $3::vector)`,
      [id, title, JSON.stringify(axis(i))],
    );
  }
});

describe("ベクトル検索", () => {
  it("質問のベクトルに近いチャンクから順に返す", async () => {
    const q = axis(0).map((x, j) => (j === 1 ? 0.3 : x));
    const hits = await vectorSearch(db, q, 2);
    expect(hits.map((h) => h.title)).toEqual([
      "デプロイ手順（本番環境）",
      "セキュリティ方針",
    ]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("答えの材料に [1] から番号を振る", async () => {
    const hits = await vectorSearch(db, axis(1), 1);
    expect(context(hits)).toMatch(/^\[1\] セキュリティ方針\nURL: /);
  });
});

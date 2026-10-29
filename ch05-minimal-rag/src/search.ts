import type { Queryable } from "./db.js";

// #region hit
export interface Hit {
  docId: string;
  title: string;
  url: string;
  content: string;
  score: number; // 1 に近いほど質問と意味が近い（コサイン類似度）
}
// #endregion

// #region vector-search
// 質問の埋め込み（vector）に意味の近いチャンクを k 件返す。
// <=> は pgvector のコサイン距離（0 に近いほど近い）
export async function vectorSearch(
  db: Queryable,
  vector: number[],
  k = 6,
): Promise<Hit[]> {
  const res = await db.query<Hit>(
    `SELECT c.doc_id AS "docId", d.title, d.url, c.content,
            1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c JOIN documents d ON d.id = c.doc_id
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2`,
    [JSON.stringify(vector), k],
  );
  return res.rows;
}
// #endregion

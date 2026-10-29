import type { Queryable } from "./db.js";

// #region hit
export interface Hit {
  docId: string;
  title: string;
  url: string;
  source: string;
  eventDate: string | null; // 資料の日付（YYYY-MM-DD）
  canonical: boolean; // 正本か
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
    `SELECT c.doc_id AS "docId", d.title, d.url, d.source,
            to_char(d.event_date, 'YYYY-MM-DD') AS "eventDate",
            d.canonical,
            c.content,
            1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c JOIN documents d ON d.id = c.doc_id
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2`,
    [JSON.stringify(vector), k],
  );
  return res.rows;
}
// #endregion

// #region doc-search
// 同じ資料のチャンクが上位を埋めないように、資料ごとにまとめる。
// 近いチャンクを多めに（pool 件）取り、資料ごとに最初に現れた順で
// k 件の資料を選ぶ。1つの資料から当たったチャンクは、資料の中の
// 順番（ord）に並べて1つの材料にする
export async function docSearch(
  db: Queryable,
  vector: number[],
  k = 6,
  pool = 40,
): Promise<Hit[]> {
  const res = await db.query<Hit & { ord: number }>(
    `SELECT c.doc_id AS "docId", d.title, d.url, d.source,
            to_char(d.event_date, 'YYYY-MM-DD') AS "eventDate",
            d.canonical,
            c.content, c.ord,
            1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c JOIN documents d ON d.id = c.doc_id
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2`,
    [JSON.stringify(vector), pool],
  );
  // #endregion
  // #region doc-search-group
  const docs = new Map<string, (Hit & { ord: number })[]>();
  for (const h of res.rows) {
    if (!docs.has(h.docId) && docs.size >= k) continue;
    docs.set(h.docId, [...(docs.get(h.docId) ?? []), h]);
  }
  return [...docs.values()].map((hits) => ({
    ...hits[0], // 最も近いチャンクの類似度と資料の情報を使う
    content: hits
      .sort((a, b) => a.ord - b.ord)
      .map((h) => h.content)
      .join("\n"),
  }));
}
// #endregion

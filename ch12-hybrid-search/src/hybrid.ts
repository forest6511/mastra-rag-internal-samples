import crypto from "node:crypto";
import fs from "node:fs";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { MODEL } from "./agent.js";
import type { Queryable } from "./db.js";
import { offline, recording } from "./record.js";
import type { Hit } from "./search.js";

type Chunk = Hit & { chunkId: number; ord: number };
const COLUMNS = `c.id AS "chunkId", c.doc_id AS "docId", d.title, d.url,
  d.source, to_char(d.event_date, 'YYYY-MM-DD') AS "eventDate",
  d.canonical, c.content, c.ord`;

// #region terms
// 質問から、全文検索に使う語を取り出す。日本語は空白で語が分かれない
// ので、漢字・カタカナ・英数字が2文字以上続く所を1つの語とみなす
// （形態素解析を使わない簡易な方法。「決済」「クレペイ」「PR」など）
export function queryTerms(q: string): string[] {
  const runs = q.match(/[一-龥々ァ-ヶーA-Za-z0-9#._-]{2,}/g) ?? [];
  return [...new Set(runs)].slice(0, 12);
}
// #endregion

// #region keyword-search
// 語が多く当たったチャンクほど上にする。同じ点数のときは、資料の ID と
// 資料の中の順番で並べる（チャンクの ID は DB ごとに違うので使わない）。LIKE '%語%' は、pg_bigm の
// GIN の索引があると、2文字ずつの組（bigram）で候補を絞って速くなる
const like = (t: string) =>
  `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
export async function keywordSearch(
  db: Queryable,
  terms: string[],
  pool = 40,
): Promise<Chunk[]> {
  if (terms.length === 0) return [];
  const hit = terms.map((_, i) => `(c.content LIKE $${i + 1})::int`);
  const res = await db.query<Chunk>(
    `SELECT ${COLUMNS}, (${hit.join(" + ")})::float AS score
       FROM chunks c JOIN documents d ON d.id = c.doc_id
      WHERE ${hit.map((h) => `${h} = 1`).join(" OR ")}
      ORDER BY score DESC, c.doc_id, c.ord LIMIT ${pool}`,
    terms.map(like),
  );
  return res.rows;
}
// #endregion

// #region vector-chunks
// 意味の近い順にチャンクを pool 件取る（第7章の docSearch の前半）
export async function vectorChunks(
  db: Queryable,
  vector: number[],
  pool = 40,
): Promise<Chunk[]> {
  const res = await db.query<Chunk>(
    `SELECT ${COLUMNS}, 1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c JOIN documents d ON d.id = c.doc_id
      ORDER BY c.embedding <=> $1::vector LIMIT $2`,
    [JSON.stringify(vector), pool],
  );
  return res.rows;
}
// #endregion

// #region rrf
// RRF（Reciprocal Rank Fusion）: 2つの検索の順位を、順位の逆数の和で
// 1つにまとめる。点数の尺度（類似度と当たった語の数）が違っても、
// 順位だけを使うのでそのまま足せる。k = 60 は RRF の論文の値
export function rrf(lists: Chunk[][], k = 60): Chunk[] {
  const sum = new Map<number, Chunk & { s: number }>();
  for (const list of lists) {
    list.forEach((h, i) => {
      const cur = sum.get(h.chunkId) ?? { ...h, s: 0 };
      cur.s += 1 / (k + i + 1);
      sum.set(h.chunkId, cur);
    });
  }
  return [...sum.values()]
    .sort((a, b) => b.s - a.s)
    .map(({ s, ...h }) => ({ ...h, score: s }));
}
// #endregion

// #region by-doc
// チャンクの順位を、資料ごとにまとめて上から k 件の資料にする（第7章）
export function byDoc(chunks: Chunk[], k: number): Hit[] {
  const docs = new Map<string, Chunk[]>();
  for (const h of chunks) {
    if (!docs.has(h.docId) && docs.size >= k) continue;
    docs.set(h.docId, [...(docs.get(h.docId) ?? []), h]);
  }
  return [...docs.values()].map((hs) => ({
    ...hs[0],
    content: hs
      .sort((a, b) => a.ord - b.ord)
      .map((h) => h.content)
      .join("\n"),
  }));
}
// #endregion

// #region rerank
// 生成 AI に「質問に答えるのに役立つ順」に並べ替えさせる（リランク）。
// 候補の題名と本文の先頭 400 字を見せ、番号の順を返させる
const reranker = new Agent({
  id: "kanade-rerank",
  name: "並べ替え",
  instructions:
    "社内資料の検索結果を、質問に答えるのに役立つ順に並べ替えます。",
  model: MODEL,
});
const Order = z.object({ order: z.array(z.number().int()) });

export async function rerank(q: string, hits: Hit[], top = 6) {
  if (hits.length <= top) return hits;
  const list = hits
    .map((h, i) => `[${i}] ${h.title}\n${h.content.slice(0, 400)}`)
    .join("\n\n");
  const prompt =
    `質問: ${q}\n\n候補:\n${list}\n\n` +
    `役に立つものを最大${top}件、番号の順で返します。`;
  const order = await cached(prompt, async () => {
    const res = await reranker.generate(prompt, {
      structuredOutput: { schema: Order },
    });
    return res.object.order;
  });
  const picked = order.filter((i) => hits[i]).slice(0, top);
  return [...new Set(picked)].map((i) => hits[i]);
}
// #endregion

// #region hybrid-search
// 改善した検索: 意味と言葉の2つの検索を RRF でまとめ、資料ごとに
// 15件にしてから、生成 AI で並べ替えて上位6件を材料にする。
// rerank: false で並べ替えを外す（比べるため）
export async function hybridSearch(
  db: Queryable,
  question: string,
  vector: number[],
  opts = { rerank: true },
): Promise<Hit[]> {
  const [v, kw] = await Promise.all([
    vectorChunks(db, vector),
    keywordSearch(db, queryTerms(question)),
  ]);
  const fused = rrf([v, kw]);
  if (!opts.rerank) return byDoc(fused, 6);
  return rerank(question, byDoc(fused, 15), 6);
}
// #endregion

// 並べ替えの結果も records/reranks.jsonl に記録し、OFFLINE=1 では
// 記録から返す
const FILE = "records/reranks.jsonl";
async function cached(prompt: string, run: () => Promise<number[]>) {
  const key = crypto
    .createHash("sha256")
    .update(MODEL + prompt)
    .digest("hex");
  const lines = fs.existsSync(FILE)
    ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean)
    : [];
  const saved = lines
    .map((l) => JSON.parse(l) as { k: string; order: number[] })
    .find((r) => r.k === key);
  if (saved) return saved.order;
  if (offline()) throw new Error("OFFLINE: この並べ替えは記録に無い");
  const order = await run();
  if (recording()) {
    fs.appendFileSync(FILE, JSON.stringify({ k: key, order }) + "\n");
  }
  return order;
}

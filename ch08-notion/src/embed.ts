import crypto from "node:crypto";
import fs from "node:fs";
import OpenAI from "openai";
import { offline } from "./record.js";

// #region model
// 埋め込みのモデル。1つの文を 1536 個の数の並びにする
export const EMBED_MODEL = "text-embedding-3-small";
export const DIMENSIONS = 1536;
// #endregion

// #region cache
// 同じ文の埋め込みは2回作らない。records/embeddings.jsonl に
// 「文のハッシュ → 埋め込み」を1行ずつためる。費用が減り、
// 同じ文には毎回同じ数が使われるので、検索の結果も変わらない
const CACHE = "records/embeddings.jsonl";
const cache = new Map<string, number[]>();
if (fs.existsSync(CACHE)) {
  for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
    if (line) {
      const { k, v } = JSON.parse(line);
      cache.set(k, v);
    }
  }
}
const keyOf = (text: string) =>
  crypto
    .createHash("sha256")
    .update(EMBED_MODEL + text)
    .digest("hex");
// #endregion

// #region embed
export async function embed(texts: string[]): Promise<number[][]> {
  const missing = [...new Set(texts)].filter(
    (t) => !cache.has(keyOf(t)),
  );
  if (missing.length > 0 && offline()) {
    throw new Error("OFFLINE: 埋め込みの記録に無い文があります");
  }
  const client = missing.length > 0 ? new OpenAI() : null;
  for (let i = 0; client && i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100); // 1回に100件まで送る
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: batch,
    });
    fs.mkdirSync("records", { recursive: true });
    res.data.forEach((d, j) => {
      cache.set(keyOf(batch[j]), d.embedding);
      const line = { k: keyOf(batch[j]), v: d.embedding };
      fs.appendFileSync(CACHE, JSON.stringify(line) + "\n");
    });
  }
  return texts.map((t) => cache.get(keyOf(t)) as number[]);
}
// #endregion

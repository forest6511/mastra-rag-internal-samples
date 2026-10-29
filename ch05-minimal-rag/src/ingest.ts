import { chunk } from "./chunk.js";
import type { Queryable } from "./db.js";
import { SCHEMA } from "./db.js";
import type { Doc } from "./doc.js";
import { embed } from "./embed.js";

// #region migrate
// 表を作る。PGlite は複数の文を exec で流す
// （pg の Pool は query で流せる）
export async function migrate(db: Queryable & { exec?: unknown }) {
  if (typeof db.exec === "function") {
    await (db.exec as (sql: string) => Promise<unknown>)(SCHEMA);
  } else {
    await db.query(SCHEMA);
  }
}
// #endregion

// #region save-doc
// 資料1件を保存する。本文をチャンクに分け、どのチャンクの先頭にも
// 題名を付けてから埋め込みを作る（題名の語でも探せるように）。
// 同じ資料を2回入れたら、古いチャンクを消して入れ直す
export async function saveDoc(db: Queryable, d: Doc): Promise<number> {
  const pieces = chunk(d.body).map((p) => `${d.title}\n${p}`);
  const vectors = await embed(pieces);
  await db.query(
    `INSERT INTO documents (id, source, url, title, body)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET url = $3, title = $4, body = $5`,
    [d.id, d.source, d.url, d.title, d.body],
  );
  await db.query("DELETE FROM chunks WHERE doc_id = $1", [d.id]);
  for (const [i, content] of pieces.entries()) {
    await db.query(
      `INSERT INTO chunks (doc_id, ord, content, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [d.id, i, content, JSON.stringify(vectors[i])],
    );
  }
  return pieces.length;
}
// #endregion

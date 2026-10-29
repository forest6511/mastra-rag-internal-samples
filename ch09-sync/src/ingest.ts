import crypto from "node:crypto";
import { chunk } from "./chunk.js";
import type { Queryable } from "./db.js";
import { SCHEMA } from "./db.js";
import type { Doc } from "./doc.js";
import { embed } from "./embed.js";

// #region migrate
// テーブルを作る。PGlite は複数の文を exec で流す
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
// 資料1件を保存する。題名と本文のハッシュが前回と同じなら何もしない
// （埋め込みを作り直さない）。変わっていたらチャンクを入れ直す。
// 戻り値は入れたチャンクの数（変わっていなければ 0）。
// 第9章: ハッシュはチャンクを入れ終えてから最後に書く。途中で止まっても、
// 次の回でハッシュが合わず、入れ直される
export async function saveDoc(db: Queryable, d: Doc): Promise<number> {
  const hash = crypto
    .createHash("sha256")
    .update(`${d.title}\n${d.body}`)
    .digest("hex");
  const old = await db.query<{ body_hash: string }>(
    "SELECT body_hash FROM documents WHERE id = $1",
    [d.id],
  );
  // 正本の印は本文と別に持つので、本文が同じでも毎回書く
  await db.query("UPDATE documents SET canonical = $2 WHERE id = $1", [
    d.id,
    d.canonical ?? false,
  ]);
  if (old.rows[0]?.body_hash === hash) return 0;
  // #endregion
  // #region save-doc-insert
  // どのチャンクの先頭にも題名を付ける（題名の語でも探せるように）
  const pieces = chunk(d.body).map((p) => `${d.title}\n${p}`);
  const vectors = await embed(pieces);
  await db.query(
    `INSERT INTO documents
       (id, source, url, title, body, event_date, body_hash, canonical)
     VALUES ($1, $2, $3, $4, $5, $6, '', $7)
     ON CONFLICT (id) DO UPDATE SET url = $3, title = $4, body = $5,
       event_date = $6, body_hash = '', canonical = $7`,
    [
      ...[d.id, d.source, d.url, d.title, d.body],
      ...[d.eventDate ?? null, d.canonical ?? false],
    ],
  );
  await db.query("DELETE FROM chunks WHERE doc_id = $1", [d.id]);
  for (const [i, content] of pieces.entries()) {
    await db.query(
      `INSERT INTO chunks (doc_id, ord, content, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [d.id, i, content, JSON.stringify(vectors[i])],
    );
  }
  await db.query("UPDATE documents SET body_hash = $2 WHERE id = $1", [
    d.id,
    hash,
  ]);
  return pieces.length;
}
// #endregion

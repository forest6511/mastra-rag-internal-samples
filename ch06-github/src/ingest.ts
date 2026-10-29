import crypto from "node:crypto";
import { chunk } from "./chunk.js";
import type { Queryable } from "./db.js";
import { SCHEMA } from "./db.js";
import type { Doc } from "./doc.js";
import { embed } from "./embed.js";

// #region migrate
// 表を作る。PGlite は複数の文を exec で流す（pg の Pool は query で流せる）
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
// 戻り値は入れたチャンクの数（変わっていなければ 0）
export async function saveDoc(db: Queryable, d: Doc): Promise<number> {
  const hash = crypto
    .createHash("sha256")
    .update(`${d.title}\n${d.body}`)
    .digest("hex");
  const old = await db.query<{ body_hash: string }>(
    "SELECT body_hash FROM documents WHERE id = $1",
    [d.id],
  );
  if (old.rows[0]?.body_hash === hash) return 0;
  const pieces = chunk(`${d.title}\n${d.body}`);
  const vectors = await embed(pieces);
  await db.query(
    `INSERT INTO documents
       (id, source, url, title, body, event_date, body_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET url = $3, title = $4, body = $5,
       event_date = $6, body_hash = $7`,
    [d.id, d.source, d.url, d.title, d.body, d.eventDate ?? null, hash],
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

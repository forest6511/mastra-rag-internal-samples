import crypto from "node:crypto";
import { chunk } from "./chunk.js";
import type { Queryable } from "./db.js";
import { RLS, SCHEMA } from "./db.js";
import type { Doc } from "./doc.js";
import { embed } from "./embed.js";

// #region migrate
// テーブルを作る。PGlite は複数の文を exec で流す
// （pg の Pool は query で流せる）
export async function migrate(db: Queryable & { exec?: unknown }) {
  for (const sql of [SCHEMA, RLS]) {
    if (typeof db.exec === "function") {
      await (db.exec as (sql: string) => Promise<unknown>)(sql);
    } else {
      await db.query(sql);
    }
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
    `INSERT INTO documents (id, source, url, title, body,
       event_date, body_hash, canonical, acl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET url = $3, title = $4, body = $5,
       event_date = $6, body_hash = $7, canonical = $8, acl = $9`,
    [
      ...[d.id, d.source, d.url, d.title, d.body],
      ...[d.eventDate ?? null, hash, d.canonical ?? false],
      d.acl ?? ["all"],
    ],
  );
  await db.query("DELETE FROM chunks WHERE doc_id = $1", [d.id]);
  for (const [i, content] of pieces.entries()) {
    await db.query(
      `INSERT INTO chunks (doc_id, ord, content, embedding, acl)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [d.id, i, content, JSON.stringify(vectors[i]), d.acl ?? ["all"]],
    );
  }
  return pieces.length;
}
// #endregion

// #region save-acl
// 権限だけを書き換える。本文が同じでも、対応表が変われば権限は変わる。
// 本文のハッシュだけで更新を決めると、権限の取り消しが反映されない
// （試作で実際に起きた）。戻り値は、書き換えたかどうか
export async function saveAcl(db: Queryable, d: Doc): Promise<boolean> {
  const acl = d.acl ?? ["all"];
  const res = await db.query<{ id: string }>(
    `UPDATE documents SET acl = $2
     WHERE id = $1 AND acl IS DISTINCT FROM $2 RETURNING id`,
    [d.id, acl],
  );
  if (res.rows.length === 0) return false;
  await db.query("UPDATE chunks SET acl = $2 WHERE doc_id = $1", [
    d.id,
    acl,
  ]);
  return true;
}
// #endregion

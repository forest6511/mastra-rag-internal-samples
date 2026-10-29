import crypto from "node:crypto";
import { pool } from "./db.js";
import { FETCHERS } from "./fetch-all.js";

// #region verify
// 索引と元のサービスを突き合わせる（書き込みはしない）。
// missing: 元にあるのに索引に無い / extra: 索引に残っている消えた資料 /
// stale: 本文が元と違う（更新が反映されていない） /
// empty: チャンクが1つも無い資料（埋め込みが入っていない）
const hashOf = (title: string, body: string) =>
  crypto.createHash("sha256").update(`${title}\n${body}`).digest("hex");

const rows = [];
for (const [source, fetch] of Object.entries(FETCHERS)) {
  const src = new Map(
    (await fetch()).map((d) => [d.id, hashOf(d.title, d.body)]),
  );
  const db = await pool.query<{
    id: string;
    body_hash: string;
    n: number;
  }>(
    `SELECT d.id, d.body_hash, count(c.id)::int AS n
       FROM documents d LEFT JOIN chunks c ON c.doc_id = d.id
      WHERE d.source = $1 GROUP BY d.id`,
    [source],
  );
  const empty = db.rows.filter((r) => r.n === 0).length;
  const inDb = new Map(db.rows.map((r) => [r.id, r.body_hash]));
  // #endregion
  // #region verify-compare
  const missing = [...src.keys()].filter((id) => !inDb.has(id));
  const extra = [...inDb.keys()].filter((id) => !src.has(id));
  const stale = [...src].filter(
    ([id, h]) => inDb.has(id) && inDb.get(id) !== h,
  );
  rows.push({
    ...{ source, src: src.size, db: inDb.size },
    ...{ missing: missing.length, extra: extra.length },
    ...{ stale: stale.length, empty },
    ok: missing.length + extra.length + stale.length + empty === 0,
  });
}
// #endregion

// #region report
// 3つとも0のサービスだけ ok。1つでも違えば終了コード 1
console.table(rows);
await pool.end();
process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
// #endregion

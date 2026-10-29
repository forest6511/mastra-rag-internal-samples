import type { Queryable } from "./db.js";
import type { Doc } from "./doc.js";
import { saveAcl, saveDoc } from "./ingest.js";

// #region stats
// 1つのサービスを同期した結果の件数
export interface SyncStats {
  source: string;
  fetched: number; // 元のサービスから取れた資料
  added: number; // 新しく入れた
  updated: number; // 本文が変わって入れ直した
  aclChanged: number; // 本文は同じで、権限だけ書き換えた
  unchanged: number; // 変わっていない（埋め込みを作り直さない）
  deleted: number; // 元のサービスから消えたので索引から消した
  kept: boolean; // 安全装置で、消すのをやめた
}
// #endregion

// #region sync-source
// 1つのサービスの資料を、全件の一覧と突き合わせて同期する。
// 差分の取得（更新日時で絞る）では、消えた資料は返ってこない。
// そこで全件の ID を取り直し、一覧に無い資料を索引から消す
export async function syncSource(
  db: Queryable,
  source: string,
  docs: Doc[],
): Promise<SyncStats> {
  const before = await db.query<{ id: string }>(
    "SELECT id FROM documents WHERE source = $1",
    [source],
  );
  const known = new Set(before.rows.map((r) => r.id));
  const stats: SyncStats = {
    ...{ source, fetched: docs.length, added: 0, updated: 0 },
    aclChanged: 0,
    ...{ unchanged: 0, deleted: 0, kept: false },
  };
  for (const d of docs) {
    const aclChanged = known.has(d.id) && (await saveAcl(db, d));
    const n = await saveDoc(db, d);
    if (n === 0 && aclChanged) stats.aclChanged++;
    else if (n === 0) stats.unchanged++;
    else if (known.has(d.id)) stats.updated++;
    else stats.added++;
  }
  // #endregion
  // #region delete-missing
  // 安全装置: 元が0件なのに索引に資料があるときは消さない。
  // 接続を外した・トークンが切れた・権限が変わった、でも0件になり、
  // そのまま消すと索引が空になる
  const fetchedIds = docs.map((d) => d.id);
  if (fetchedIds.length === 0 && known.size > 0) {
    stats.kept = true;
  } else {
    const res = await db.query<{ id: string }>(
      `DELETE FROM documents
       WHERE source = $1 AND NOT (id = ANY($2)) RETURNING id`,
      [source, fetchedIds],
    );
    stats.deleted = res.rows.length;
  }
  await db.query(
    `INSERT INTO sync_state (source, synced_at, fetched, error)
     VALUES ($1, now(), $2, null)
     ON CONFLICT (source) DO UPDATE
       SET synced_at = now(), fetched = $2, error = null`,
    [source, docs.length],
  );
  return stats;
}
// #endregion

// #region record-failure
// 取得に失敗したサービスは、索引に触らず、失敗を記録だけする
// （前回の資料を残す。消さない）
export async function recordFailure(
  db: Queryable,
  source: string,
  error: unknown,
): Promise<void> {
  await db.query(
    `INSERT INTO sync_state (source, synced_at, fetched, error)
     VALUES ($1, now(), 0, $2)
     ON CONFLICT (source) DO UPDATE SET synced_at = now(), error = $2`,
    [source, String(error).slice(0, 500)],
  );
}
// #endregion

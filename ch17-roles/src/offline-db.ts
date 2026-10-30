import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { markAcl } from "./acl.js";
import { markCanonical } from "./canonical.js";
import { FETCHERS } from "./fetch-all.js";
import { migrate } from "./ingest.js";
import { syncSource } from "./sync.js";

// #region offline-db
// 記録した応答（OFFLINE=1）で動かすときの索引。5つのサービスの記録を、
// Node の中で動く PostgreSQL（PGlite）に毎回取り込む（第1部と同じ）
export async function offlineDb() {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db);
  for (const [source, fetch] of Object.entries(FETCHERS)) {
    await syncSource(db, source, markAcl(markCanonical(await fetch())));
  }
  return db;
}
// #endregion

import pg from "pg";

// #region queryable
// pg の Pool と、テストで使う PGlite の両方が持つ形だけを使う
export interface Queryable {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://rag:ragpass@localhost:55432/rag",
});
// #endregion

// #region schema
// 資料1件が documents の1行、検索の単位のチャンクが chunks の1行
export const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS documents (
  id     text PRIMARY KEY,
  source text NOT NULL,
  url    text NOT NULL,
  title  text NOT NULL,
  body   text NOT NULL,
  event_date date,          -- 資料の日付（本文の「作成日」）
  body_hash  text NOT NULL, -- 題名と本文のハッシュ（変わったかを見る）
  canonical  boolean NOT NULL DEFAULT false -- 正本か（canonical.yml）
);
CREATE TABLE IF NOT EXISTS chunks (
  id        bigserial PRIMARY KEY,
  doc_id    text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord       int NOT NULL,
  content   text NOT NULL,
  embedding vector(1536) NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_embedding
  ON chunks USING hnsw (embedding vector_cosine_ops);
-- 第10章: 資料とチャンクに、見てよいグループを持たせる
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS acl text[] NOT NULL DEFAULT '{all}';
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS acl text[] NOT NULL DEFAULT '{all}';
-- 第9章: サービスごとの同期の状態（最後に回った時刻と件数）
CREATE TABLE IF NOT EXISTS sync_state (
  source     text PRIMARY KEY,
  synced_at  timestamptz NOT NULL,
  fetched    int NOT NULL,
  error      text           -- 失敗したときの内容（成功なら null）
);
`;
// #endregion

// #region rls
// RLS（Row Level Security）: 行ごとの読み取りの制限。
// 役割 rag_reader で読むときは、行の acl と利用者のグループ
// （app.groups）が1つでも重なる行だけが返る。
// 表を作った役割（管理者）には、この制限はかからない
export const RLS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rag_reader')
  THEN CREATE ROLE rag_reader NOLOGIN; END IF;
END $$;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_acl ON documents;
CREATE POLICY documents_acl ON documents FOR SELECT TO rag_reader
  USING (acl && string_to_array(current_setting('app.groups', true), ','));
DROP POLICY IF EXISTS chunks_acl ON chunks;
CREATE POLICY chunks_acl ON chunks FOR SELECT TO rag_reader
  USING (acl && string_to_array(current_setting('app.groups', true), ','));
GRANT SELECT ON documents, chunks TO rag_reader;
`;
// #endregion

// #region as-user
// 検索と本文の取得は、必ずこの関数を通す。1つのトランザクションの
// 中だけ、役割を rag_reader に、app.groups を利用者のグループにする。
// SET LOCAL と set_config(..., true) は、トランザクションが終わると
// 元に戻る。接続プールで次の利用者に、前の利用者の設定が残らない
type Client = Queryable & { release?: () => void };
type Db = Queryable | { connect(): Promise<Client> };

export async function asUser<T>(
  groups: string[],
  fn: (c: Queryable) => Promise<T>,
  db: Db = pool,
): Promise<T> {
  const c: Client = "connect" in db ? await db.connect() : db;
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE rag_reader");
    await c.query("SELECT set_config('app.groups', $1, true)", [
      groups.join(","),
    ]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release?.();
  }
}
// #endregion

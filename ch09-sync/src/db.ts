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
-- #endregion
-- #region schema-sync
-- 第9章: サービスごとの同期の状態
CREATE TABLE IF NOT EXISTS sync_state (
  source     text PRIMARY KEY,
  synced_at  timestamptz,    -- 最後に成功した回の、取得を始めた時刻
  fetched    int,            -- 最後に成功した回で取れた件数
  failed_at  timestamptz,    -- 最後に失敗した時刻
  error      text            -- 最後の失敗・注意の内容（成功なら null）
);
`;
// #endregion

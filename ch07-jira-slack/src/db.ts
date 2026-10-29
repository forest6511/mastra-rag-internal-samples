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
  body_hash  text NOT NULL  -- 題名と本文のハッシュ（変わったかを見る）
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
`;
// #endregion

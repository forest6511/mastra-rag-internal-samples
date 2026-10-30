import pg from "pg";

// #region queryable
// pg の Pool と、テストで使う PGlite の両方が持つ形だけを使う
export interface Queryable {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

// #endregion
// #region pool
// 第16章: AWS では DATABASE_URL を使わず、PGHOST などの環境変数
// （pg が読む）でつなぐ。Aurora が一時停止から再開するまで約15秒
// （24時間を超えて止まっていると30秒以上）かかるので、接続を待つ
// 時間を長めにする。使っていない接続は10秒で閉じ、一時停止を妨げない
export const pool = new pg.Pool({
  connectionString: process.env.PGHOST
    ? undefined
    : (process.env.DATABASE_URL ??
      "postgres://rag:ragpass@localhost:55432/rag"),
  connectionTimeoutMillis: 45_000,
  idleTimeoutMillis: 10_000,
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
-- 既定は空（誰にも見せない）。権限を付け損ねた資料は、開く側でなく
-- 閉じる側に倒す
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS acl text[] NOT NULL DEFAULT '{}';
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS acl text[] NOT NULL DEFAULT '{}';
-- #region schema-bigm
-- 第12章: 日本語の全文検索のインデックス（pg_bigm がある DB で
-- だけ作る。テストで使う PGlite には無いが、LIKE の結果は同じ）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions
             WHERE name = 'pg_bigm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_bigm;
    EXECUTE 'CREATE INDEX IF NOT EXISTS chunks_bigm
             ON chunks USING gin (content gin_bigm_ops)';
  END IF;
END $$;
-- #endregion
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

// #region rls
// RLS（Row Level Security）: 行ごとの読み取りの制限。
// ロール rag_reader で読むときは、行の acl と利用者のグループ
// （app.groups）が1つでも重なる行だけが返る。
// 表を作ったロール（管理者）には、この制限はかからない
export const RLS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rag_reader')
  THEN CREATE ROLE rag_reader NOLOGIN; END IF;
END $$;
-- 表の所有者が rag_reader に切り替えられるようにする
-- （スーパーユーザーでない所有者で要る。Aurora の管理ユーザーなど。
-- 第16章）
GRANT rag_reader TO CURRENT_USER;
-- 利用者のグループ（app.groups のカンマ区切りを配列にする）
CREATE OR REPLACE FUNCTION groups() RETURNS text[]
  LANGUAGE sql STABLE AS $f$
    SELECT string_to_array(current_setting('app.groups', true), ',')
  $f$;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_acl ON documents;
CREATE POLICY documents_acl ON documents FOR SELECT TO rag_reader
  USING (acl && groups());
DROP POLICY IF EXISTS chunks_acl ON chunks;
CREATE POLICY chunks_acl ON chunks FOR SELECT TO rag_reader
  USING (acl && groups());
GRANT SELECT ON documents, chunks TO rag_reader;
`;
// #endregion

// #region as-user
// 検索と本文の取得は、必ずこの関数を通す。1つのトランザクションの
// 中だけ、ロールを rag_reader に、app.groups を利用者のグループにする。
// SET LOCAL と set_config(..., true) は、トランザクションが終わると
// 元に戻る。接続プールで次の利用者に、前の利用者の設定が残らない
type Client = Queryable & { release?: (err?: Error) => void };
type Db = Queryable | { connect(): Promise<Client> };

export async function asUser<T>(
  groups: string[],
  fn: (c: Queryable) => Promise<T>,
  db: Db = pool,
): Promise<T> {
  const c: Client = "connect" in db ? await db.connect() : db;
  let result: T;
  // #endregion
  // #region as-user-body
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE rag_reader");
    // HNSW の索引で近い順に取った後で RLS が絞るので、見える資料が
    // 少ない利用者ほど件数が減る。足りなければ索引を引き続ける
    await c.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
    await c.query("SELECT set_config('app.groups', $1, true)", [
      groups.join(","),
    ]);
    result = await fn(c);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    // 失敗した接続は、プールに戻さずに捨てる
    c.release?.(e instanceof Error ? e : undefined);
    throw e;
  }
  c.release?.();
  return result;
}
// #endregion

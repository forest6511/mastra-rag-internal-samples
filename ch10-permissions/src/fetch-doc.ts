import { groupsOf } from "./acl.js";
import { asUser, pool, type Queryable } from "./db.js";

// #region fetch-doc
// 資料の ID を指定して本文を取る（Claude・ChatGPT の入口が使う。
// 第15章）。ここも asUser を通す。見えない資料は「無い」と同じに返し、
// 「権限がありません」とは言わない（言うと、資料があることが分かる）
export async function fetchDoc(c: Queryable, id: string) {
  const res = await c.query<{ title: string; body: string }>(
    "SELECT title, body FROM documents WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}
// #endregion

// npm run fetch -- "notion:…" --as nakamura
if (process.argv[1]?.endsWith("fetch-doc.ts")) {
  const args = process.argv.slice(2);
  const user = args[args.indexOf("--as") + 1] ?? "";
  const id = args.find(
    (a, i) => a !== "--as" && args[i - 1] !== "--as",
  );
  const doc = await asUser(groupsOf(user), (c) =>
    fetchDoc(c, id ?? ""),
  );
  console.log(doc ? `${doc.title}\n\n${doc.body}` : "見つかりません");
  await pool.end();
}

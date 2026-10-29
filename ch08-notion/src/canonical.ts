import fs from "node:fs";
import YAML from "yaml";
import type { Queryable } from "./db.js";
import type { Doc } from "./doc.js";
import type { Hit } from "./search.js";

interface Canonical {
  topic: string;
  title: string;
  keywords: string[];
}
const canonicals = (): Canonical[] =>
  YAML.parse(fs.readFileSync("canonical.yml", "utf8")).canonical;

// #region canonical
// canonical.yml に題名がある資料に、正本の印を付ける
export function markCanonical(docs: Doc[]): Doc[] {
  const titles = new Set(canonicals().map((c) => c.title));
  return docs.map((d) => ({ ...d, canonical: titles.has(d.title) }));
}
// #endregion

// #region add-canonical
// 質問に話題の語（keywords）があれば、その正本を答えの材料に入れる。
// 検索の順位に頼らず DB から取るので、資料が増えて正本の順位が
// 下がっても入る。入れるときは、材料のいちばん下と入れ替える
export async function addCanonical(
  db: Queryable,
  question: string,
  hits: Hit[],
): Promise<Hit[]> {
  const out = [...hits];
  let last = out.length - 1; // 入れ替える位置。正本どうしは押し出さない
  for (const c of canonicals()) {
    if (!c.keywords.some((k) => question.includes(k))) continue;
    if (out.some((h) => h.title === c.title)) continue;
    const res = await db.query<Hit>(
      `SELECT d.id AS "docId", d.title, d.url, d.source, d.canonical,
              to_char(d.event_date, 'YYYY-MM-DD') AS "eventDate",
              d.body AS content, 0 AS score
         FROM documents d WHERE d.title = $1`,
      [c.title],
    );
    if (res.rows[0] && last >= 0) out.splice(last--, 1, res.rows[0]);
  }
  return out;
}
// #endregion

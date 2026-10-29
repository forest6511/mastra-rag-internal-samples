import { answer } from "../agent.js";
import { addCanonical } from "../canonical.js";
import { asUser, type Queryable } from "../db.js";
import { embed } from "../embed.js";
import { hybridSearch } from "../hybrid.js";
import { docSearch } from "../search.js";
import type { Question } from "./questions.js";

// #region ask-as
// 聞く人の権限で答える。mode で検索の作りを選ぶ:
// ch10（第10章までの意味の検索）・hybrid（全文検索と RRF）・
// rerank（さらに生成 AI で並べ替える。第12章の改善後）
export type Mode = "ch10" | "hybrid" | "rerank";
type Db = Parameters<typeof asUser>[2];

export async function ask(
  db: Db,
  q: Question,
  rep: number,
  mode: Mode,
) {
  const [v] = await embed([q.question]);
  const hits = await asUser(
    q.groups,
    async (c: Queryable) => {
      const found =
        mode === "ch10"
          ? await docSearch(c, v)
          : await hybridSearch(c, q.question, v, {
              rerank: mode === "rerank",
            });
      return addCanonical(c, q.question, found);
    },
    db,
  );
  return {
    text: await answer(q.question, hits, undefined, rep),
    hits,
  };
}
// #endregion

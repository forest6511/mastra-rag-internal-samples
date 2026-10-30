import {
  answer,
  INSTRUCTIONS_ASK,
  INSTRUCTIONS_CH13,
} from "../agent.js";
import { clarify, eventNames } from "../clarify.js";
import { addCanonical } from "../canonical.js";
import { asUser, type Queryable } from "../db.js";
import { embed } from "../embed.js";
import { hybridSearch } from "../hybrid.js";
import { docSearch } from "../search.js";
import type { Hit } from "../search.js";
import type { Question } from "./questions.js";

// #region ask-as
// 聞く人の権限で答える。mode で検索の作りを選ぶ:
// ch10（第10章までの意味の検索）・hybrid（全文検索と RRF）・
// rerank（さらに生成 AI で並べ替える。第12章の改善後）・
// ch13-ask（hybrid に、聞き返す段と第13章の指示を足す。採らなかった
// 版）・ch13（hybrid に、第13章の指示だけを足す）
export type Mode = "ch10" | "hybrid" | "rerank" | "ch13-ask" | "ch13";
type Db = Parameters<typeof asUser>[2];
// #endregion

// #region ask-mode

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
  return answerFor(q, hits, rep, mode);
}
// #endregion

// #region ask-ch13
// 第13章: 資料に出来事の名前を添え、第13章の指示で答える。
// ch13-ask は、その前に聞き返す段を通す（試して採らなかった版）
async function answerFor(
  q: Question,
  hits: Hit[],
  rep: number,
  mode: Mode,
) {
  const say = (ins?: string, ev?: Map<string, string>) =>
    answer(q.question, hits, ins, rep, ev);
  if (mode === "ch13") {
    return { text: await say(INSTRUCTIONS_CH13, eventNames()), hits };
  }
  if (mode === "ch13-ask") {
    const back = await clarify(q.question, hits, rep);
    const text = back ?? (await say(INSTRUCTIONS_ASK, eventNames()));
    return { text, hits };
  }
  return { text: await say(), hits };
}
// #endregion

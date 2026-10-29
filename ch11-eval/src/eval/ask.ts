import { answer } from "../agent.js";
import { addCanonical } from "../canonical.js";
import { asUser, type Queryable } from "../db.js";
import { embed } from "../embed.js";
import { docSearch } from "../search.js";
import type { Question } from "./questions.js";

// #region ask-as
// この章までの作り（第10章）で、聞く人の権限で答える。
// rep は何回目か（記録を回ごとに分けるため）
type Db = Parameters<typeof asUser>[2];
export async function ask(db: Db, q: Question, rep: number) {
  const [v] = await embed([q.question]);
  const hits = await asUser(
    q.groups,
    async (c: Queryable) =>
      addCanonical(c, q.question, await docSearch(c, v)),
    db,
  );
  return {
    text: await answer(q.question, hits, undefined, rep),
    hits,
  };
}
// #endregion

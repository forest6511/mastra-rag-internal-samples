import { groupsOf } from "./acl.js";
import { answer, INSTRUCTIONS_CH13 } from "./agent.js";
import { addCanonical } from "./canonical.js";
import { eventNames } from "./clarify.js";
import { asUser } from "./db.js";
import { embed } from "./embed.js";
import { hybridSearch } from "./hybrid.js";

type Db = Parameters<typeof asUser>[2];

// #region answer-as
// 利用者の名前で質問に答える（第13章の作り: hybrid の検索・正本・
// 出来事の名前・第13章の指示）。Slack ボット（第14章）が使う
export async function answerAs(
  user: string,
  question: string,
  db?: Db,
) {
  const [vector] = await embed([question]);
  const hits = await asUser(
    groupsOf(user),
    async (c) =>
      addCanonical(
        c,
        question,
        await hybridSearch(c, question, vector),
      ),
    db,
  );
  const events = eventNames();
  const text = await answer(
    question,
    hits,
    INSTRUCTIONS_CH13,
    1,
    events,
  );
  return { text, hits };
}
// #endregion

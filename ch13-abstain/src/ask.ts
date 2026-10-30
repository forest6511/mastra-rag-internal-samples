import { groupsOf } from "./acl.js";
import { answer, INSTRUCTIONS_CH13 } from "./agent.js";
import { addCanonical } from "./canonical.js";
import { eventNames } from "./clarify.js";
import { asUser, pool } from "./db.js";
import { embed } from "./embed.js";
import { hybridSearch } from "./hybrid.js";

// #region main
// npm run ask -- "質問" --as nakamura
// 利用者（--as）のグループで見える資料だけを、答えの材料にする。
// 第12章: 検索を、意味と言葉の2つの検索を RRF でまとめる形にした。
// --rerank を付けると、さらに生成 AI で並べ替える。
// 第13章: 資料に出来事の名前を添え、第13章の指示で答える
const args = process.argv.slice(2);
const user = args[args.indexOf("--as") + 1];
const question = args.find(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--as",
);
if (!question || !args.includes("--as")) {
  console.log('使い方: npm run ask -- "質問" --as <利用者>');
  process.exit(1);
}
const groups = groupsOf(user);
const rerank = args.includes("--rerank");
const [vector] = await embed([question]);
const hits = await asUser(groups, async (c) =>
  addCanonical(
    c,
    question,
    await hybridSearch(c, question, vector, { rerank }),
  ),
);
console.log(`利用者: ${user}（${groups.join(", ")}）`);
hits.forEach((h, i) =>
  console.log(`[${i + 1}] ${h.score.toFixed(3)} ${h.title}`),
);
const text = await answer(
  ...([question, hits, INSTRUCTIONS_CH13, 1, eventNames()] as const),
);
console.log("\n" + text);
await pool.end();
// #endregion

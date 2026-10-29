import { answer, answerWithoutRag } from "./agent.js";
import { buildDb } from "./build.js";
import { addCanonical } from "./canonical.js";
import { embed } from "./embed.js";
import { docSearch } from "./search.js";

// npm run ask -- "質問"            社内の資料を探して答える
// npm run ask -- "質問" --no-rag   資料を渡さずに答える（第2章で比べる）
// 記録にある質問は、キー無しで本書と同じ答えを返す。
// OPENAI_API_KEY があれば、記録に無い質問にも答える
const question = process.argv[2];
if (!question) {
  console.log('使い方: npm run ask -- "質問" [--no-rag]');
  process.exit(1);
}
if (process.argv.includes("--no-rag")) {
  console.log(await answerWithoutRag(question));
  process.exit(0);
}
const db = await buildDb();
const [v] = await embed([question]);
const hits = await addCanonical(db, question, await docSearch(db, v));
hits.forEach((h, i) =>
  console.log(`[${i + 1}] ${h.docId}  ${h.title}`),
);
console.log("\n" + (await answer(question, hits)));

import { answer, INSTRUCTIONS, INSTRUCTIONS_CH06 } from "./agent.js";
import { pool } from "./db.js";
import { embed } from "./embed.js";
import { docSearch, vectorSearch } from "./search.js";

// #region main
// npm run ask -- "質問" [--by-doc] [--ch06]
const args = process.argv.slice(2);
const question =
  args.find((a) => !a.startsWith("--")) ?? "デプロイ手順は？";
// --ch06 で第6章の指示（日付の新しい資料を優先）
const instructions = args.includes("--ch06")
  ? INSTRUCTIONS_CH06
  : INSTRUCTIONS;
const [vector] = await embed([question]);
// --by-doc で、資料ごとにまとめた上位 6 件を材料にする（第7章）
const hits = args.includes("--by-doc")
  ? await docSearch(pool, vector)
  : await vectorSearch(pool, vector);
hits.forEach((h, i) =>
  console.log(`[${i + 1}] ${h.score.toFixed(3)} ${h.title}`),
);
console.log("\n" + (await answer(question, hits, instructions)));
await pool.end();
// #endregion

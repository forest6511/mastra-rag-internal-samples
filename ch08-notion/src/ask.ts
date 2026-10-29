import { answer, INSTRUCTIONS, INSTRUCTIONS_CH05 } from "./agent.js";
import { pool } from "./db.js";
import { embed } from "./embed.js";
import { vectorSearch } from "./search.js";

// #region main
// npm run ask -- "デプロイ手順は？"（--ch05 で第5章の指示）
const args = process.argv.slice(2);
const question =
  args.find((a) => !a.startsWith("--")) ?? "デプロイ手順は？";
const instructions = args.includes("--ch05")
  ? INSTRUCTIONS_CH05
  : INSTRUCTIONS;
const [vector] = await embed([question]);
const hits = await vectorSearch(pool, vector);
hits.forEach((h, i) =>
  console.log(`[${i + 1}] ${h.score.toFixed(3)} ${h.title}`),
);
console.log("\n" + (await answer(question, hits, instructions)));
await pool.end();
// #endregion

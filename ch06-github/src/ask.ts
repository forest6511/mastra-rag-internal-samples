import { answer } from "./agent.js";
import { pool } from "./db.js";
import { embed } from "./embed.js";
import { vectorSearch } from "./search.js";

// #region main
// npm run ask -- "デプロイ手順は？"
const question = process.argv[2] ?? "デプロイ手順は？";
const [vector] = await embed([question]);
const hits = await vectorSearch(pool, vector);
hits.forEach((h, i) =>
  console.log(`[${i + 1}] ${h.score.toFixed(3)} ${h.title}`),
);
console.log("\n" + (await answer(question, hits)));
await pool.end();
// #endregion

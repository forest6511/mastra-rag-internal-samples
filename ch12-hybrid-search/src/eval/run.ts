import fs from "node:fs";
import { pool } from "../db.js";
import { ask, type Mode } from "./ask.js";
import { judge } from "./judge.js";
import { questions } from "./questions.js";

// #region run
// npm run eval -- <ラベル> [ch10|hybrid|rerank]（既定は hybrid）
// 18問 × REPS 回（既定3回）を答えて採点し、
// eval/runs/<ラベル>.jsonl に1行ずつ書く。途中で止めても、
// もう一度回せば、書き終えた行は飛ばして続きから回る
const label = process.argv[2] ?? "run";
const mode = (process.argv[3] ?? "hybrid") as Mode;
const reps = Number(process.env.REPS ?? 3);
const file = `eval/runs/${label}.jsonl`;
const done = new Set(
  (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((r: { qid: string; rep: number }) => `${r.qid}|${r.rep}`),
);
// #endregion
// #region run-loop
for (const q of questions()) {
  for (let rep = 1; rep <= reps; rep++) {
    if (done.has(`${q.id}|${rep}`)) continue;
    const t0 = Date.now();
    const a = await ask(pool, q, rep, mode);
    const ms = Date.now() - t0;
    const titles = a.hits.map((h) => h.title);
    const score = await judge(q, a.text, titles, rep);
    const row = {
      ...{ qid: q.id, usecase: q.usecase },
      ...{ expected: q.expected_behavior, mode, rep, ms },
      answer: a.text,
      hits: a.hits.map((h) => ({ id: h.docId, title: h.title })),
      judge: score,
    };
    fs.appendFileSync(file, JSON.stringify(row) + "\n");
    process.stdout.write(".");
  }
}
console.log(`\n${file}`);
await pool.end();
// #endregion

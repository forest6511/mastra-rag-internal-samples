import { questions } from "./questions.js";
import { coverage, readRows, recall, type Row } from "./summary.js";

// #region main
// npm run by-question -- <ラベル> <ラベル> ...
// 答えるべき10問について、問ごとに3回の平均を、ラベルの順に並べる。
// 改善で良くなった問と悪くなった問を見つけるために使う
const labels = process.argv.slice(2);
const runs = labels.map((l) => readRows(`eval/runs/${l}.jsonl`));
const avg = (rs: Row[], f: (r: Row) => number) =>
  (rs.reduce((s, r) => s + f(r), 0) / rs.length).toFixed(2);
console.log(`ラベル: ${labels.join(" → ")}`);
for (const q of questions()) {
  if (q.expected_behavior !== "answer") continue;
  const per = runs.map((rows) => rows.filter((r) => r.qid === q.id));
  const hit = per.map((rs) => avg(rs, coverage)).join(" → ");
  const docs = per.map((rs) => avg(rs, recall)).join(" → ");
  console.log(`${q.id} 必須要点 ${hit} / 正解の資料 ${docs}`);
}
// #endregion

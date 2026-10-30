import { questions } from "./questions.js";
import { readRows } from "./summary.js";

// #region main
// npm run behavior -- <ラベル> <ラベル> ...
// 答えてはいけない8問について、期待どおりに振る舞えた回数（3回中）を
// ラベルの順に並べ、過半数（2回以上）で振る舞えた問の数を数える
const labels = process.argv.slice(2);
const runs = labels.map((l) => readRows(`eval/runs/${l}.jsonl`));
const qs = questions().filter((q) => q.expected_behavior !== "answer");
console.log(`ラベル: ${labels.join(" → ")}`);
const passed = runs.map(() => 0);
for (const q of qs) {
  const cells = runs.map((rows, i) => {
    const rs = rows.filter((r) => r.qid === q.id);
    const ok = rs.filter((r) => r.judge.behavior_ok).length;
    if (ok * 2 > rs.length) passed[i]++;
    return `${ok}/${rs.length}`;
  });
  console.log(`${q.id} ${q.expected_behavior} ${cells.join(" → ")}`);
}
console.log(
  `過半数で期待どおり: ${passed.map((p) => `${p}/8`).join(" → ")}`,
);
// #endregion

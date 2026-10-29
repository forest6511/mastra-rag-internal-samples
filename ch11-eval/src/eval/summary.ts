import fs from "node:fs";
import { expectedDocs } from "./questions.js";
import type { Score } from "./judge.js";

// #region rows
// eval/runs/<ラベル>.jsonl の1行
export interface Row {
  qid: string;
  usecase: string;
  expected: string;
  mode: string;
  rep: number;
  ms: number;
  hits: { id: string; title: string }[];
  judge: Score;
}
export const readRows = (file: string): Row[] =>
  fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
// #endregion

const mean = (a: number[]) =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const f2 = (x: number) => (Number.isNaN(x) ? "-" : x.toFixed(2));

// #region coverage
// 必須要点の充足: 答え1つで、入った要点の割合
const coverage = (r: Row) => {
  const h = r.judge.must_hit;
  return h.length ? h.filter(Boolean).length / h.length : NaN;
};
// 検索の指標: 正解の資料のうち、材料（上位6件）に入った割合
const recall = (r: Row) => {
  const want = expectedDocs()[r.qid] ?? [];
  const got = new Set(r.hits.map((h) => h.id));
  return want.length
    ? want.filter((id) => got.has(id)).length / want.length
    : NaN;
};
// #endregion

// #region summarize
// 1問ごとに3回の平均を取ってから、問の間で平均する。
// 3回の幅は、問ごとの標準偏差を問の間で平均した値
// 試作の記録（final-v4）は資料の ID の付け方が今と違うので、
// 検索の指標は出さない（withRecall = false）
export function summarize(
  rows: Row[],
  pick: (r: Row) => boolean,
  withRecall = true,
) {
  const rs = rows.filter(pick);
  const byQ = new Map<string, Row[]>();
  for (const r of rs) byQ.set(r.qid, [...(byQ.get(r.qid) ?? []), r]);
  const qs = [...byQ.values()];
  const ok = (a: number[]) => a.filter((x) => !Number.isNaN(x));
  return {
    n: rs.length,
    coverage: f2(mean(ok(qs.map((x) => mean(x.map(coverage)))))),
    spread: f2(mean(ok(qs.map((x) => sd(x.map(coverage)))))),
    wrong: f2(mean(rs.map((r) => r.judge.wrong.length))),
    behavior: f2(mean(rs.map((r) => (r.judge.behavior_ok ? 1 : 0)))),
    usable: f2(mean(rs.map((r) => (r.judge.usable === 0 ? 1 : 0)))),
    recall: withRecall ? f2(mean(ok(rs.map(recall)))) : "-",
    seconds: (mean(rs.map((r) => r.ms)) / 1000).toFixed(1),
  };
}
// #endregion

// #region main
// npm run summary -- <ラベル>   答えるべき10問と、答えてはいけない8問に
// 分けて、段（mode）ごとに表にする
if (process.argv[1]?.endsWith("summary.ts")) {
  const label = process.argv[2] ?? "run";
  const rows = readRows(`eval/runs/${label}.jsonl`);
  const withRecall = label !== "final-v4";
  for (const mode of [...new Set(rows.map((r) => r.mode))]) {
    const of = (ans: boolean) => (r: Row) =>
      r.mode === mode && (r.expected === "answer") === ans;
    console.log(mode);
    console.table({
      答えるべき10問: summarize(rows, of(true), withRecall),
      答えてはいけない8問: summarize(rows, of(false), withRecall),
    });
  }
}
// #endregion

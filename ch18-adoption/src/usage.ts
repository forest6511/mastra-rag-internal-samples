import fs from "node:fs";
import YAML from "yaml";
import { questions } from "./eval/questions.js";
import type { LogEntry } from "./slack/question-log.js";

// #region usage
// 質問ログ（第14章）から、利用状況を数える。人ごとの質問数（Slack の
// ID は slack-users.yml で名前にする）・日ごとの質問数・よく材料に
// なった資料・評価セット（第11章）にまだ無い質問（足す候補）
export function usage(
  entries: LogEntry[],
  names: Map<string, string>,
  known: Set<string>,
) {
  const count = <T>(xs: T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    byUser: count(entries.map((e) => names.get(e.user) ?? e.user)),
    byDay: count(entries.map((e) => e.at.slice(0, 10))).sort(),
    topDocs: count(entries.flatMap((e) => e.docIds)).slice(0, 5),
    newQuestions: [...new Set(entries.map((e) => e.question))].filter(
      (q) => !known.has(q),
    ),
  };
}
// #endregion

// #region usage-main
if (process.argv[1]?.endsWith("usage.ts")) {
  const file = process.env.QUESTION_LOG ?? "logs/questions.jsonl";
  const entries = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry);
  const ids = YAML.parse(fs.readFileSync("slack-users.yml", "utf8"))
    .users as Record<string, string>;
  const known = new Set(questions().map((q) => q.question));
  const u = usage(entries, new Map(Object.entries(ids)), known);
  const line = (xs: [string, number][]) =>
    xs.map(([k, n]) => `${k} ${n}`).join(" / ");
  console.log(`質問 ${entries.length} 件`);
  console.log("人ごと:", line(u.byUser));
  console.log("日ごと:", line(u.byDay));
  console.log("よく材料になった資料:");
  for (const [id, n] of u.topDocs) console.log(`  ${n} ${id}`);
  console.log(`評価セットにまだ無い質問 ${u.newQuestions.length} 件:`);
  for (const q of u.newQuestions) console.log(`  ${q}`);
}
// #endregion

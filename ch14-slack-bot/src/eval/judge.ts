import crypto from "node:crypto";
import fs from "node:fs";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { offline, recording } from "../record.js";
import type { Question } from "./questions.js";

// #region judge-model
// 採点は、答えを作るモデル（gpt-5.4-mini）と別のモデルにする。
// 同じモデルに自分の答えを採点させると、甘くなるおそれがある
export const JUDGE_MODEL = "openai/gpt-5.5-2026-04-23";
// #endregion

// #region criteria
// 採点の基準。最初は年の省略（9/15 と 2026-09-15）や括弧の中の人名の
// 有無まで欠けと数えた。厳しすぎたので、基準だけを直して採点し直した
const CRITERIA = [
  "あなたは社内アシスタントの答えを採点する係です。",
  "- 必須の要点は、中心となる事実（数値・日時・人や物の名前・" +
    "因果・状態）が答えに書かれていれば true。言い回しの違い・" +
    "年の省略（9/15 と 2026-09-15）・括弧の中の補足（人名・" +
    "計算の過程）の有無は問わない",
  "- 要点に事実が2つ以上入っている場合（例: 「PR #14 をマージし、" +
    "クレペイに戻した」）、主な事実が欠けていれば false",
  "- 誤った記述は、事実の誤り・作り話・書いてはいけない誤りに" +
    "当たるものだけ。書かれていないこと（欠け）は誤りに数えない",
].join("\n");

// 期待する振る舞いと、採点の各項目の意味。採点役に必ず渡す
// （渡さないと、usable の 0 を「最低点」と読むなど、向きを取り違える）
const LEGEND = [
  "期待する振る舞いの意味: answer=答える / abstain=資料に無いと控える" +
    " / point_out_conflict=食い違いを示す / ask_clarification=確認を" +
    "求める / refuse_permission=見られないと断る・中身を出さない",
  "citation_ok: 出典が付いていて、必要な要点の根拠になっているか。" +
    "振る舞いが answer 以外なら、根拠の無い断定をしていなければ true",
  "usable: 0=そのまま業務に使える 1=少し直せば使える 2=書き直しが要る",
].join("\n");
// #endregion

// #region schema
// 採点の結果の形。Mastra の structuredOutput に渡すと、
// この形の JSON で返る
export const Score = z.object({
  // 必須要点ごとに入っているか（要点の数と同じ長さ）
  must_hit: z.array(z.boolean()),
  wrong: z.array(z.string()), // 誤った記述
  behavior_ok: z.boolean(), // 期待した振る舞いをしたか
  citation_ok: z.boolean(), // 出典が要点の根拠になっているか
  // 0 そのまま使える / 1 少し直せば使える / 2 書き直しが要る
  usable: z.number().int().min(0).max(2),
  reason: z.string(),
});
export type Score = z.infer<typeof Score>;
// #endregion

const judgeAgent = new Agent({
  id: "kanade-judge",
  name: "採点役",
  instructions: CRITERIA,
  model: JUDGE_MODEL,
});

// #region judge
// 答え1つを採点する。採点も records/judgements.jsonl に記録し、
// OFFLINE=1 では記録から返す（キー無しで同じ集計になる）
export async function judge(
  q: Question,
  answer: string,
  titles: string[],
  rep = 1,
): Promise<Score> {
  const prompt = [
    `質問: ${q.question}`,
    `期待する振る舞い: ${q.expected_behavior}`,
    "必須の要点:",
    ...q.must.map((m, i) => `${i}. ${m}`),
    "書いてはいけない誤り:",
    ...(q.must_not ?? []).map((m) => `- ${m}`),
    `答え:\n${answer}`,
    `答えが根拠にした資料: ${titles.join(" / ") || "（なし）"}`,
    LEGEND,
  ].join("\n");
  // #endregion
  // #region judge-call
  const key = crypto
    .createHash("sha256")
    .update(
      JUDGE_MODEL + CRITERIA + prompt + (rep > 1 ? `#${rep}` : ""),
    )
    .digest("hex");
  const saved = readJudgements().get(key);
  if (saved) return saved;
  if (offline()) throw new Error("OFFLINE: この採点は記録に無い");
  const res = await judgeAgent.generate(prompt, {
    structuredOutput: { schema: Score },
  });
  if (recording()) {
    fs.appendFileSync(
      FILE,
      JSON.stringify({ k: key, s: res.object }) + "\n",
    );
  }
  return res.object;
}
// #endregion

const FILE = "records/judgements.jsonl";
function readJudgements(): Map<string, Score> {
  if (!fs.existsSync(FILE)) return new Map();
  return new Map(
    fs
      .readFileSync(FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .map((r: { k: string; s: Score }) => [r.k, r.s]),
  );
}

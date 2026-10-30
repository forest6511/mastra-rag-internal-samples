import fs from "node:fs";
import YAML from "yaml";

// #region question
// 評価セットの質問1問の形（eval/questions.yml）
export interface Question {
  id: string; // Q01〜Q18
  usecase: string; // UC2（障害の振り返り）・UC9（チェックシート）など
  asker: string; // 聞く人（権限のグループを決める）
  groups: string[];
  question: string;
  expected_behavior: string; // answer・abstain・ask_clarification など
  must: string[]; // 答えに入っているべき事実（必須要点）
  must_not?: string[]; // 書いてはいけない誤り
}
// #endregion

export const questions = (): Question[] =>
  YAML.parse(fs.readFileSync("eval/questions.yml", "utf8"));

export const expectedDocs = (): Record<string, string[]> =>
  YAML.parse(fs.readFileSync("eval/expected-docs.yml", "utf8"));

// #region expectations
// 第13章: 見直した期待（EXPECT のファイル）で、問の項目を置き換える。
// eval/questions.yml は変えずに、置き換えた版で採点し直せる
export function withExpectations(qs: Question[], file?: string) {
  if (!file) return qs;
  const over: Record<string, Partial<Question>> = YAML.parse(
    fs.readFileSync(file, "utf8"),
  );
  return qs.map((q) => {
    const o = over[q.id];
    if (!o) return q;
    const { expected_behavior, must, must_not } = o;
    return { ...q, expected_behavior, must, must_not } as Question;
  });
}
// #endregion

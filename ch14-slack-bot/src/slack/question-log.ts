import fs from "node:fs";

// #region question-log
// 質問ログ: 誰が・どのチャンネルで・何を聞き・どの資料を材料にしたか。
// 答えの間違いを調べるときに使う。答えの本文は残さない。
// 書くたびに、90日より古い行を消す（社員の質問は個人の情報を含む）
const FILE = process.env.QUESTION_LOG ?? "logs/questions.jsonl";
const KEEP_DAYS = 90;

export interface LogEntry {
  at: string; // ISO 8601
  user: string; // Slack のユーザー ID
  channel: string;
  question: string;
  docIds: string[];
}

export function writeLog(entry: LogEntry, now = new Date()) {
  const limit = now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const kept = (
    fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : ""
  )
    .split("\n")
    .filter(Boolean)
    .filter((l) => Date.parse((JSON.parse(l) as LogEntry).at) >= limit);
  fs.mkdirSync(FILE.replace(/\/[^/]+$/, ""), { recursive: true });
  fs.writeFileSync(
    FILE,
    [...kept, JSON.stringify(entry)].join("\n") + "\n",
  );
}
// #endregion

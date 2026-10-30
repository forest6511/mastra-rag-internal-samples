import fs from "node:fs";
import YAML from "yaml";
import { splitForSlack, toMrkdwn } from "./mrkdwn.js";
import type { LogEntry } from "./question-log.js";

// #region deps
// メンション1件を処理するのに要るもの。Slack と答えの仕組みを外から
// 渡すので、テストでは Slack につながずに動かせる
export interface Mention {
  user: string; // 聞いた人の Slack のユーザー ID
  channel: string;
  text: string; // 「<@U…> 質問」の形
  ts: string;
  thread_ts?: string;
}
export interface Deps {
  isShared(channel: string): Promise<boolean>;
  post(channel: string, thread_ts: string, text: string): Promise<void>;
  answer(
    user: string,
    question: string,
  ): Promise<{ text: string; hits: { docId: string }[] }>;
  log(entry: LogEntry): void;
}
// #endregion

// #region user-of
// Slack のユーザー ID を、users.yml の利用者の名前に置き換える。
// 載っていない人は "" を返す。"" はどのグループにも属さないので、
// 何も見えない（第10章の groupsOf）
export function userOf(slackId: string, file = "slack-users.yml") {
  const t = YAML.parse(fs.readFileSync(file, "utf8"));
  return (t.users?.[slackId] as string | undefined) ?? "";
}
// #endregion

// #region handle
export async function handleMention(m: Mention, deps: Deps) {
  const thread = m.thread_ts ?? m.ts; // 答えは同じスレッドに書く
  // 社外の人がいるチャンネル（Slack コネクト）では答えない
  if (await deps.isShared(m.channel)) {
    const no = "このチャンネルには社外の方がいるため、答えられません。";
    await deps.post(m.channel, thread, no);
    return;
  }
  const question = m.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!question) {
    await deps.post(m.channel, thread, "質問を添えて呼んでください。");
    return;
  }
  // 答えには数秒かかるので、受け付けたことを先に見せる
  await deps.post(m.channel, thread, "調べています…");
  const r = await deps.answer(userOf(m.user), question);
  for (const part of splitForSlack(toMrkdwn(r.text))) {
    await deps.post(m.channel, thread, part);
  }
  deps.log({
    ...{ at: new Date().toISOString(), user: m.user },
    ...{ channel: m.channel, question },
    docIds: r.hits.map((h) => h.docId),
  });
}
// #endregion

import { ofKind, type SeedDoc, type World } from "../corpus.js";

interface SeedMessage {
  author: string;
  at: string;
  text: string;
}

interface Message {
  type: "message";
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  replies?: { user: string; ts: string }[];
  parent_user_id?: string;
}

// #region to-ts
// 「2026-09-15 10:02」（日本時間）を Slack の ts（UNIX 秒）にする。
// 同じ分の投稿が並ぶので、i ミリ秒ずらして重ならないようにする
export function toTs(at: string, i: number): string {
  const ms = new Date(`${at.replace(" ", "T")}:00+09:00`).getTime();
  return (ms / 1000 + i * 0.001).toFixed(6);
}
// #endregion

// #region build-slack-export
// Slack のエクスポート形式（ZIP の中身）を、パス → JSON の対応で作る。
// チャンネルごとのフォルダに、日本時間の日付ごとのファイルを置く
export function buildSlackExport(
  docs: SeedDoc[],
  world: World,
): Map<string, unknown> {
  const users = world.people.map((p, i) => ({
    id: `UK${String(i + 1).padStart(7, "0")}`,
    name: p.id,
    real_name: p.name,
    profile: { real_name: p.name, display_name: p.name },
  }));
  const uid = (pid: string) =>
    users.find((u) => u.name === pid)?.id ?? users[0].id;
  const channels = new Map<string, Message[]>();
  for (const d of ofKind(docs, "slack-thread")) {
    const msgs: Message[] = (d.messages as SeedMessage[]).map(
      (m, i) => ({
        type: "message",
        user: uid(m.author),
        text: m.text,
        ts: toTs(m.at, i),
      }),
    );
    // 2件目以降を、1件目（親）への返信にする
    const [parent, ...replies] = msgs;
    if (replies.length > 0) {
      parent.thread_ts = parent.ts;
      parent.reply_count = replies.length;
      parent.replies = replies.map((m) => ({ user: m.user, ts: m.ts }));
      for (const m of replies) {
        m.thread_ts = parent.ts;
        m.parent_user_id = parent.user;
      }
    }
    const ch = String(d.plan.channel);
    channels.set(ch, [...(channels.get(ch) ?? []), ...msgs]);
  }
  // #endregion
  // #region build-slack-export-files
  const files = new Map<string, unknown>([["users.json", users]]);
  files.set(
    "channels.json",
    [...channels.keys()].map((name, i) => ({
      id: `CK${String(i + 1).padStart(7, "0")}`,
      name,
      created: 1785000000,
      members: users.map((u) => u.id),
      topic: { value: "" },
      purpose: { value: "" },
    })),
  );
  const jstDay = (ts: string) =>
    new Date(Number(ts) * 1000 + 9 * 3600e3).toISOString().slice(0, 10);
  for (const [ch, msgs] of channels) {
    for (const m of msgs.sort((a, b) => Number(a.ts) - Number(b.ts))) {
      const path = `${ch}/${jstDay(m.ts)}.json`;
      files.set(path, [...((files.get(path) as Message[]) ?? []), m]);
    }
  }
  return files;
}
// #endregion

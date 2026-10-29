import type { Doc } from "../doc.js";
import { need } from "../env.js";
import { getJson, sourcesFromRecords } from "../record.js";

interface Message {
  ts: string;
  text: string;
  username?: string; // 取り込んだ投稿は、表示名がここに入る
  user?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
}
interface Channel {
  id: string;
  name: string;
  is_member: boolean;
}

// #region slack-get
// Slack は失敗しても HTTP 200 で ok: false を返すので、ok を確かめる
async function slackGet<T>(
  name: string,
  method: string,
  params: Record<string, string>,
  keep: (j: T) => T,
): Promise<T> {
  const res = await getJson<T & { ok?: boolean; error?: string }>(
    name,
    `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
    sourcesFromRecords()
      ? {}
      : { headers: { Authorization: `Bearer ${need("SLACK_TOKEN")}` } },
    (j) => (j.ok === false ? j : { ok: true, ...keep(j) }),
  );
  if (res.ok === false)
    throw new Error(`Slack ${method}: ${res.error}`);
  return res;
}
// #endregion

// #region keep
// 一覧の API の応答のうち、記録に残すもの（投稿者の ID などは残さない）
interface Page {
  channels?: Channel[];
  messages?: Message[];
  response_metadata?: { next_cursor?: string };
}
const keepPage = (j: Page): Page => ({
  response_metadata: { next_cursor: j.response_metadata?.next_cursor },
  channels: j.channels?.map(({ id, name, is_member }) => ({
    id,
    name,
    is_member,
  })),
  messages: j.messages?.map((m) => ({
    ts: m.ts,
    text: m.text,
    username: m.username,
    subtype: m.subtype,
    thread_ts: m.thread_ts,
    reply_count: m.reply_count,
  })),
});
// #endregion

// #region slack-all
// 一覧を返す API は、1回に返す件数に上限がある（本書は200件を指定）。
// 続きは response_metadata.next_cursor で取り、無くなるまで呼ぶ
async function slackAll<T>(
  name: string,
  method: string,
  params: Record<string, string>,
  pick: (j: Page) => T[] | undefined,
): Promise<T[]> {
  const out: T[] = [];
  let cursor = "";
  for (let n = 0; n === 0 || cursor; n++) {
    const page = {
      ...params,
      limit: "200",
      ...(cursor ? { cursor } : {}),
    };
    const j = await slackGet<Page>(
      `${name}-${n}`,
      method,
      page,
      keepPage,
    );
    out.push(...(pick(j) ?? []));
    cursor = j.response_metadata?.next_cursor ?? "";
  }
  return out;
}
// #endregion

// #region jst
// Slack の ts は UTC の秒。日本時間の「2026-09-15 10:02」にする。
// UTC のままにすると、10:02 の投稿が 01:02 として記録される
export const jstOf = (ts: string) =>
  new Date(Number(ts) * 1000 + 9 * 3600e3)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
// #endregion

// #region permalink
// 投稿の URL。p の後ろに ts の小数点を除いた数字を付ける
const permalink = (workspace: string, ch: string, ts: string) => {
  const site = `https://${workspace}.slack.com`;
  return `${site}/archives/${ch}/p${ts.replace(".", "")}`;
};
// #endregion

// #region threads
// アプリが参加しているチャンネルの、親の投稿と返信を取る。
// 親1件ごとに、親と返信の配列を返す
async function threads(): Promise<{ ch: Channel; msgs: Message[] }[]> {
  const channels = await slackAll(
    "slack-channels",
    "conversations.list",
    { types: "public_channel,private_channel" },
    (j) => j.channels,
  );
  const out: { ch: Channel; msgs: Message[] }[] = [];
  for (const ch of channels.filter((c) => c.is_member)) {
    const history = await slackAll(
      `slack-history-${ch.id}`,
      "conversations.history",
      { channel: ch.id },
      (j) => j.messages,
    );
    // #endregion
    // #region threads-replies
    for (const m of history) {
      // 参加の通知などは飛ばす（取り込んだ投稿は bot_message になる）
      if (m.subtype && m.subtype !== "bot_message") continue;
      const msgs = m.reply_count
        ? await slackAll(
            `slack-replies-${ch.id}-${m.ts}`,
            "conversations.replies",
            { channel: ch.id, ts: m.ts },
            (j) => j.messages,
          )
        : [m];
      out.push({ ch, msgs });
    }
  }
  return out;
}
// #endregion

// #region slack-posts
// 投稿1件を資料1件にする（スレッドの文脈が切れる、素朴な分け方）
export async function slackPostDocs(workspace: string): Promise<Doc[]> {
  return (await threads()).flatMap(({ ch, msgs }) =>
    msgs.map((m) => ({
      id: `slack:${ch.id}:${m.ts}`,
      source: "slack" as const,
      url: permalink(workspace, ch.id, m.ts),
      title: `#${ch.name} ${m.username ?? ""} ${jstOf(m.ts)}`,
      body: m.text,
      eventDate: jstOf(m.ts).slice(0, 10),
    })),
  );
}
// #endregion

// #region slack-threads
// スレッド1つを資料1件にする。親と返信を時刻の順に並べ、
// 1行ずつ「[日本時間 投稿者] 本文」と書く
export async function slackThreadDocs(
  workspace: string,
): Promise<Doc[]> {
  return (await threads()).map(({ ch, msgs }) => {
    const [parent] = msgs;
    const lines = msgs.map(
      (m) => `[${jstOf(m.ts)} ${m.username ?? ""}] ${m.text}`,
    );
    return {
      id: `slack:${ch.id}:${parent.ts}`,
      source: "slack" as const,
      url: permalink(workspace, ch.id, parent.ts),
      title: `#${ch.name} ${jstOf(parent.ts)} のスレッド`,
      body: lines.join("\n"),
      eventDate: jstOf(parent.ts).slice(0, 10),
    };
  });
}
// #endregion

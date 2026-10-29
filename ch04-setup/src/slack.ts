import { need } from "./env.js";
import { request } from "./http.js";

// #region slack-api
// Slack の Web API は、失敗しても HTTP 200 で
// { ok: false, error } を返す。
// ok を見ないと、読めなかったチャンネルが「0件」として黙って通る
export async function slackApi<T>(
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const res = await request<T & { ok: boolean; error?: string }>(
    `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${need("SLACK_TOKEN")}` },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Slack ${method}: ${res.error}（${JSON.stringify(params)}）`,
    );
  }
  return res;
}
// #endregion

// #region channels
// チャンネル名 → ID の対応（取り込みで作られたチャンネルも含む）
export async function channelIds(): Promise<Map<string, string>> {
  const list = await slackApi<{
    channels: { id: string; name: string }[];
  }>("conversations.list", {
    types: "public_channel,private_channel",
    limit: "200",
  });
  return new Map(list.channels.map((c) => [c.name, c.id]));
}
// #endregion

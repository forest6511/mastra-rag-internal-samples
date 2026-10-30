// #region notify
// 第16章: 取り込みが失敗したことを Slack に知らせる。ボットと同じ
// トークン（SLACK_TOKEN）で、ALERT_CHANNEL のチャンネルに投稿する。
// どちらかが無ければ（手元で動かすときなど）、何もしない
export async function notifySlack(text: string) {
  const token = process.env.SLACK_TOKEN;
  const channel = process.env.ALERT_CHANNEL;
  if (!token || !channel) return;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  // Slack は失敗しても HTTP 200 で ok: false を返す（第4章）
  if (!json.ok)
    console.error(`Slack に知らせられなかった: ${json.error}`);
}
// #endregion

// #region mrkdwn
// 答えの Markdown を、Slack の書式（mrkdwn）に直す。
// Slack は Markdown のリンク・太字・見出しをそのまま表示するので、
// <URL|題名>・*太字*・太字の行に置き換える。*太字* は前後が空白で
// ないと効かないことがあるので、日本語の文の中ではゼロ幅スペース
// （ZWSP）で挟む
const ZWSP = "\u200b";
export function toMrkdwn(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "<$2|$1>")
    .replace(/\*\*([^*]+)\*\*/g, `${ZWSP}*$1*${ZWSP}`)
    .replace(/^#{1,6}\s+(.+)$/gm, `${ZWSP}*$1*${ZWSP}`)
    .replace(/(^|\s)(https?:\/\/\S+)/g, "$1<$2>");
}
// #endregion

// #region split
// chat.postMessage の text は 4,000 字以内が推奨（40,000 字を超えると
// 切り詰められる）。長い答えは、段落の切れ目で 4,000 字ずつに分ける
export function splitForSlack(text: string, max = 4000): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split("\n\n")) {
    const next = cur ? `${cur}\n\n${para}` : para;
    if (next.length <= max) {
      cur = next;
      continue;
    }
    if (cur) out.push(cur);
    cur = para;
    while (cur.length > max) {
      out.push(cur.slice(0, max)); // 1段落が長すぎるときは字数で切る
      cur = cur.slice(max);
    }
  }
  if (cur) out.push(cur);
  return out;
}
// #endregion

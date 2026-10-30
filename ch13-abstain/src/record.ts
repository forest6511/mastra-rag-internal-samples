import fs from "node:fs";
import path from "node:path";

// #region mask
// 記録に、メールアドレス・アカウント ID・一時トークンを残さない
export function mask(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "user@example.com")
    .replace(/\b\d{6}:[0-9a-f-]{36}\b/g, "000000:0000")
    .replace(/\?token=[A-Z0-9]+/g, "?token=REDACTED");
}
// #endregion

// #region offline
// OFFLINE=1 なら、記録だけで動く。
// 記録を取ったサイトの URL を出典に使う。
// RECORD=1 のときだけ、API の応答・埋め込み・答えを records/ に書く
// （読者が自分のサービスで回しても、同梱の記録とテストは変わらない）
export const offline = () => process.env.OFFLINE === "1";
export const recording = () => process.env.RECORD === "1";
export const RECORDED_SITE = "https://kanadeloop.atlassian.net";
// #endregion

// #region records-dir
// API の応答を置くディレクトリ。第9章では、ページを消す前と後の
// 応答を別々に残すため、RECORDS_DIR で切り替えられるようにする
export const recordsDir = () => process.env.RECORDS_DIR ?? "records";
// #endregion

// #region get-json
// RECORD=1 なら API の応答を records/ に記録する。
// OFFLINE=1 なら API を呼ばず、
// 記録から返す（アカウントもキーも無しで、同じ結果になる）。
// keep を渡すと、使う項目だけを残してから記録する（投稿者の
// アカウント名など、使わない個人の情報を記録に残さない）
export async function getJson<T>(
  name: string,
  url: string,
  init: RequestInit = {},
  keep: (json: T) => T = (json) => json,
): Promise<T> {
  const file = path.join(
    recordsDir(),
    `${name.replace(/[^\w.-]+/g, "_")}.json`,
  );
  if (offline()) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  }
  const json = keep((await res.json()) as T);
  if (recording()) {
    fs.mkdirSync(recordsDir(), { recursive: true });
    fs.writeFileSync(file, mask(JSON.stringify(json, null, 1)));
  }
  return json;
}
// #endregion

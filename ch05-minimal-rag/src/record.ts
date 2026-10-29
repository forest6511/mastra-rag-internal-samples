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
// OFFLINE=1 なら、記録だけで動く。記録を取ったサイトの URL を出典に使う
export const offline = () => process.env.OFFLINE === "1";
export const RECORDED_SITE = "https://kanadeloop.atlassian.net";
// #endregion

// #region get-json
// API の応答を records/ に記録する。OFFLINE=1 のときは API を呼ばず、
// 記録から返す（アカウントもキーも無しで、同じ結果になる）
export async function getJson<T>(
  name: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const file = path.join(
    "records",
    `${name.replace(/[^\w.-]+/g, "_")}.json`,
  );
  if (offline()) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  fs.mkdirSync("records", { recursive: true });
  fs.writeFileSync(file, mask(JSON.stringify(json, null, 1)));
  return json as T;
}
// #endregion

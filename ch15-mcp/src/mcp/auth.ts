import crypto from "node:crypto";
import fs from "node:fs";
import YAML from "yaml";

// #region user-of-token
// トークンから利用者の名前を引く。トークンの値は .env の変数から読む。
// 比べるのは SHA-256 のハッシュどうしで、長さの違うトークンでも
// 比べる時間が変わらないように timingSafeEqual を使う
const hash = (s: string) =>
  crypto.createHash("sha256").update(s).digest();

export function userOfToken(token: string, file = "mcp-users.yml") {
  const t = YAML.parse(fs.readFileSync(file, "utf8")).tokens as Record<
    string,
    string
  >;
  for (const [user, envName] of Object.entries(t)) {
    const value = process.env[envName];
    if (value && crypto.timingSafeEqual(hash(value), hash(token))) {
      return user;
    }
  }
  return null;
}
// #endregion

// #region token-of
// トークンは Authorization: Bearer ヘッダーか、パス /mcp/<トークン> で
// 受け取る（ヘッダーを送れないクライアント向け）。どちらも無ければ ""
export function tokenOf(path: string, authorization?: string) {
  const fromHeader = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const fromPath = path.match(/^\/mcp\/([\w-]+)\/?$/)?.[1];
  return fromHeader ?? fromPath ?? "";
}
// #endregion

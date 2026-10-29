import fs from "node:fs";
import YAML from "yaml";
import type { Doc } from "./doc.js";

// #region acl
// acl.yml の対応表で、資料に見てよいグループを付ける。
// 置き場所は「notion:人事/評価」のように上から並べた道筋で、表の
// 「notion:人事」はその下の全部に効く（いちばん長く一致した行を使う）。
// 表に無い置き場所は default（全社員）
interface AclTable {
  default: string[];
  containers: Record<string, string[]>;
}
export function markAcl(
  docs: Doc[],
  file = process.env.ACL_FILE ?? "acl.yml",
): Doc[] {
  const t: AclTable = YAML.parse(fs.readFileSync(file, "utf8"));
  const keys = Object.keys(t.containers).sort(
    (a, b) => b.length - a.length,
  );
  const of = (c = "") =>
    keys.find((k) => c === k || c.startsWith(`${k}/`));
  return docs.map((d) => {
    const k = of(d.container);
    return { ...d, acl: k ? t.containers[k] : t.default };
  });
}
// #endregion

// #region groups-of
// 利用者の名前から、属するグループを引く。知らない利用者は
// どのグループにも属さない（何も見えない）
export function groupsOf(user: string): string[] {
  const t = YAML.parse(fs.readFileSync("users.yml", "utf8"));
  return t.users[user] ?? [];
}
// #endregion

import fs from "node:fs";
import YAML from "yaml";

// #region role-list
// 第17章: 役割ごとの依頼文（roles.yml）を読む
interface Role {
  role: string;
  user: string;
  ask: string;
}
export const loadRoles = (file = "roles.yml"): Role[] =>
  (YAML.parse(fs.readFileSync(file, "utf8")) as { roles: Role[] })
    .roles;
// #endregion

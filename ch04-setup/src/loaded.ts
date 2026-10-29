import fs from "node:fs";

// #region loaded
// 入れた資料の記録（資料 id → サービス側の id）。2回目は入れ済みを飛ばす
const FILE = "seed/out/loaded.json";

export function readLoaded(): Record<string, string> {
  return fs.existsSync(FILE)
    ? JSON.parse(fs.readFileSync(FILE, "utf8"))
    : {};
}

export function saveLoaded(log: Record<string, string>): void {
  fs.mkdirSync("seed/out", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(log, null, 1));
}
// #endregion

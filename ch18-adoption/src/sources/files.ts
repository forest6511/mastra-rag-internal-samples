import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Doc } from "../doc.js";

// #region files
// 第18章: 自社の資料に置き換える例。フォルダの中の Markdown を
// 資料にする（社内 wiki を書き出したものなど）。
// - 置き場所（container）は「files:いちばん上のフォルダ」。acl.yml で
//   フォルダごとに見てよいグループを決める
// - 資料の日付は、頭の date を優先し、無ければファイルの更新日
// - 出典の URL は、頭の url（元のページ）。無ければファイルの場所
export function filesDocs(dir: string): Doc[] {
  const files = fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files.map((rel) => {
    const full = path.join(dir, rel);
    const text = fs.readFileSync(full, "utf8");
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    const head = (m ? YAML.parse(m[1]) : {}) as {
      date?: string | Date;
      url?: string;
    };
    const body = m ? text.slice(m[0].length) : text;
    const date = head.date ?? fs.statSync(full).mtime;
    return {
      id: `files:${rel}`,
      source: "files" as const,
      url: head.url ?? `file://${path.resolve(full)}`,
      title: body.match(/^# (.+)$/m)?.[1] ?? path.basename(rel, ".md"),
      body: body.trim(),
      eventDate: new Date(date).toISOString().slice(0, 10),
      container: `files:${rel.split(path.sep)[0]}`,
    };
  });
}
// #endregion

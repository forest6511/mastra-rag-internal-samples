import fs from "node:fs";
import YAML from "yaml";
import type { Doc } from "./doc.js";

// #region canonical
// canonical.yml に題名がある資料に、正本の印を付ける
export function markCanonical(docs: Doc[]): Doc[] {
  const titles = new Set(
    (
      YAML.parse(fs.readFileSync("canonical.yml", "utf8"))
        .canonical as {
        title: string;
      }[]
    ).map((c) => c.title),
  );
  return docs.map((d) => ({ ...d, canonical: titles.has(d.title) }));
}
// #endregion

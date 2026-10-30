import { describe, expect, it } from "vitest";
import { markAcl } from "../src/acl.js";
import { filesDocs } from "../src/sources/files.js";

// #region files-test
describe("フォルダの Markdown を資料にする", () => {
  const docs = filesDocs("test/fixtures/company-docs");

  it("頭の date と url を使い、無ければファイルの更新日と場所", () => {
    const keihi = docs.find((d) => d.title === "経費精算の締め日")!;
    expect(keihi.eventDate).toBe("2026-10-01");
    expect(keihi.url).toBe("https://wiki.example.com/soumu/keihi");
    const hyoka = docs.find((d) => d.title === "評価の時期")!;
    expect(hyoka.url.startsWith("file://")).toBe(true);
    expect(hyoka.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("いちばん上のフォルダで権限を決める", () => {
    const acl = markAcl(docs, "test/fixtures/acl-files.yml");
    const of = (t: string) => acl.find((d) => d.title === t)!.acl;
    expect(of("評価の時期")).toEqual(["hr"]);
    expect(of("経費精算の締め日")).toEqual(["all"]);
  });
});
// #endregion

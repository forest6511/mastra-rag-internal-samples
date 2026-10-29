import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { markAcl } from "../src/acl.js";
import { markCanonical } from "../src/canonical.js";
import { asUser } from "../src/db.js";
import { embed } from "../src/embed.js";
import { FETCHERS } from "../src/fetch-all.js";
import { fetchDoc } from "../src/fetch-doc.js";
import { migrate } from "../src/ingest.js";
import { docSearch } from "../src/search.js";
import { syncSource } from "../src/sync.js";

// #region setup
// 記録した応答で5つのサービスを同期し、権限を付ける
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
const SALES = ["all", "sales"];
const DEV = ["all", "dev"];
const out = (f: string) => readFileSync(`out/${f}`, "utf8");
const titlesFor = async (groups: string[], q: string) => {
  const [v] = await embed([q]);
  const hits = await asUser(groups, (c) => docSearch(c, v), db);
  return hits.map((h) => h.title);
};
const syncAll = async (aclFile?: string) => {
  const rows = [];
  for (const [source, fetch] of Object.entries(FETCHERS)) {
    const docs = markAcl(markCanonical(await fetch()), aclFile);
    rows.push(await syncSource(db, source, docs));
  }
  return rows;
};

beforeAll(async () => {
  await migrate(db);
  await syncAll();
});
// #endregion

// #region tests
describe("見てよい資料だけを返す", () => {
  it("営業の検索には、開発だけの資料が入らない", async () => {
    const titles = await titlesFor(SALES, out("question-Q13.txt"));
    expect(titles.some((t) => t.startsWith("#incident"))).toBe(false);
    expect(titles.some((t) => t.startsWith("kanade-yoyaku"))).toBe(
      false,
    );
    const dev = await titlesFor(DEV, out("question-Q13.txt"));
    expect(dev.some((t) => t.startsWith("#incident"))).toBe(true);
  });

  // #endregion
  // #region tests-count
  it("グループごとに、見える資料の数が違う", async () => {
    const count = (g: string[]) =>
      asUser(
        g,
        async (c) =>
          (
            await c.query<{ n: number }>(
              "SELECT count(*)::int AS n FROM documents",
            )
          ).rows[0].n,
        db,
      );
    expect(await count(SALES)).toBe(20);
    expect(await count(DEV)).toBe(25);
    expect(await count(["all", "hr"])).toBe(21);
    expect(await count([])).toBe(0); // グループの無い利用者
  });

  // #endregion
  // #region tests-hr
  it("人事の資料は、ID を指定しても営業には返さない", async () => {
    const id = out("hr-id.txt").trim();
    const fetch = (g: string[]) =>
      asUser(g, (c) => fetchDoc(c, id), db);
    expect(await fetch(SALES)).toBeNull();
    expect((await fetch(["all", "hr"]))?.title).toContain("退職者");
  });
  // #endregion

  // #region tests-pool
  it("トランザクションの後に、利用者の設定が残らない", async () => {
    await asUser(DEV, (c) => c.query("SELECT 1"), db);
    const r = await db.query<{ u: string; g: string }>(
      `SELECT current_user AS u,
              coalesce(current_setting('app.groups', true), '') AS g`,
    );
    expect(r.rows[0]).toEqual({ u: "postgres", g: "" });
  });

  it("対応表を変えると、本文が同じでも権限が変わる", async () => {
    const rows = await syncAll("test/fixtures/acl-revoked.yml");
    const gh = rows.find((r) => r.source === "github");
    expect(gh).toMatchObject({ aclChanged: 4, updated: 0 });
    const dev = await titlesFor(DEV, out("question-Q13.txt"));
    expect(dev.some((t) => t.startsWith("kanade-yoyaku"))).toBe(false);
    await syncAll(); // 元の対応表に戻す
  });
  // #endregion

  // #region tests-answers
  it("記録した答え: 営業・人事・仕込まれた指示", () => {
    expect(out("q13-nakamura.txt")).not.toContain("#incident");
    expect(out("q14-yamamoto.txt")).not.toContain("退職者面談メモ");
    expect(out("fetch-hr-nakamura.txt")).toContain("見つかりません");
    expect(out("wifi-nakamura.txt")).not.toContain("人事の資料も");
  });
});
// #endregion

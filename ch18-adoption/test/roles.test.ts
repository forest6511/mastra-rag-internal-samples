import { describe, expect, it } from "vitest";
import { answerAs } from "../src/answer-as.js";
import { offlineDb } from "../src/offline-db.js";
import { loadRoles } from "../src/role-list.js";
import { usage } from "../src/usage.js";

// #region roles-test
// 依頼文の一覧と、記録した答えでの再生（キー無し）
describe("役割ごとの依頼文", () => {
  it("6つの役割の依頼文が10ある", () => {
    const roles = loadRoles();
    expect(roles).toHaveLength(10);
    expect(new Set(roles.map((r) => r.role)).size).toBe(6);
  });

  it("営業の依頼文に、正本の3年で答える（記録した答え）", async () => {
    process.env.OFFLINE = "1";
    const db = await offlineDb();
    const r = loadRoles().find((x) => x.role === "営業")!;
    const { text } = await answerAs(r.user, r.ask, db);
    expect(text).toContain("3年");
    await db.close();
  }, 60_000);
});
// #endregion

// #region usage-test
describe("利用状況", () => {
  it("人ごと・資料ごとに数え、評価セットに無い質問を拾う", () => {
    const at = "2026-10-30T01:00:00Z";
    const u = usage(
      [
        { at, user: "U1", channel: "C", question: "A", docIds: ["d1"] },
        { at, user: "U1", channel: "C", question: "B", docIds: ["d1"] },
        { at, user: "U2", channel: "C", question: "C", docIds: [] },
      ],
      new Map([["U1", "kobayashi"]]),
      new Set(["A"]),
    );
    expect(u.byUser).toEqual([
      ["kobayashi", 2],
      ["U2", 1],
    ]);
    expect(u.topDocs).toEqual([["d1", 2]]);
    expect(u.newQuestions).toEqual(["B", "C"]);
  });
});
// #endregion

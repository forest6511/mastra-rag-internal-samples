import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { markAcl } from "../src/acl.js";
import { markCanonical } from "../src/canonical.js";
import { askBack, eventsOf } from "../src/clarify.js";
import { ask, type Mode } from "../src/eval/ask.js";
import { judge } from "../src/eval/judge.js";
import { questions, withExpectations } from "../src/eval/questions.js";
import { readRows } from "../src/eval/summary.js";
import { FETCHERS } from "../src/fetch-all.js";
import { migrate } from "../src/ingest.js";
import type { Hit } from "../src/search.js";
import { syncSource } from "../src/sync.js";

// #region unit
describe("出来事を数えて聞き返す", () => {
  const hit = (docId: string, title: string) =>
    ({ docId, title }) as Hit;

  it("同じ出来事の資料は1つに数え、出来事の無い資料は数えない", () => {
    const found = eventsOf([
      hit("jira:KAN-13", "KAN-13 決済エラー障害"),
      hit("github:kanade-yoyaku:14", "PR #14"),
      hit("jira:KAN-14", "KAN-14 予約確定メール遅延"),
      hit("confluence:622613", "デプロイ手順（本番環境）"),
    ]);
    expect(found.map((e) => e.id)).toEqual(["E4", "E2"]);
  });

  it("聞き返す答えに、候補の日付と資料の題名を並べる", () => {
    const text = askBack(
      eventsOf([
        hit("jira:KAN-14", "KAN-14 予約確定メール遅延"),
        hit("jira:KAN-13", "KAN-13 決済エラー障害"),
      ]),
    );
    expect(text).toContain("2026-08-20 予約確定メールの遅延");
    expect(text).toContain("（資料: KAN-13 決済エラー障害）");
  });
});
// #endregion

// #region replay
// 測った作り（hybrid・ch13-ask・ch13）の評価を、見直した期待の
// 採点も含めて、キー無しで再生する
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
beforeAll(async () => {
  await migrate(db);
  for (const [source, fetch] of Object.entries(FETCHERS)) {
    await syncSource(db, source, markAcl(markCanonical(await fetch())));
  }
});

// #endregion

// #region replay-runs
const EXPECT = "eval/expectations-ch13.yml";
describe.each([
  ["ch12-hybrid", "hybrid", undefined],
  ["ch12-hybrid-reviewed", "hybrid", EXPECT],
  ["ch13-ask", "ch13-ask", undefined],
  ["ch13-ask-reviewed", "ch13-ask", EXPECT],
  ["ch13", "ch13", undefined],
  ["ch13-reviewed", "ch13", EXPECT],
] as [string, Mode, string | undefined][])(
  "記録した評価（%s）",
  (label, mode, expect_) => {
    it("54件とも、材料・答え・採点が記録と同じ", async () => {
      const rows = readRows(`eval/runs/${label}.jsonl`);
      const qs = withExpectations(questions(), expect_);
      const byId = new Map(qs.map((q) => [q.id, q]));
      for (const r of rows) {
        const q = byId.get(r.qid)!;
        const a = await ask(db, q, r.rep, mode);
        expect(a.hits.map((h) => h.docId)).toEqual(
          r.hits.map((h) => h.id),
        );
        const titles = a.hits.map((h) => h.title);
        expect(await judge(q, a.text, titles, r.rep)).toEqual(r.judge);
      }
    }, 60_000);
  },
);
// #endregion

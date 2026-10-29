import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { markAcl } from "../src/acl.js";
import { markCanonical } from "../src/canonical.js";
import { ask } from "../src/eval/ask.js";
import { judge } from "../src/eval/judge.js";
import { questions } from "../src/eval/questions.js";
import { readRows, summarize, type Row } from "../src/eval/summary.js";
import { FETCHERS } from "../src/fetch-all.js";
import { migrate } from "../src/ingest.js";
import { syncSource } from "../src/sync.js";

// #region summary-test
// 試作の4段比較の記録（final-v4）を集計すると、第2章の数字になる
describe("集計", () => {
  it("試作の記録から 0.01・0.46・0.34・0.51 が出る", () => {
    const rows = readRows("eval/runs/final-v4.jsonl");
    const of = (mode: string) => (r: Row) =>
      r.mode === mode && r.expected === "answer";
    const cov = (m: string) => summarize(rows, of(m), false).coverage;
    expect(["none", "manual", "naive", "improved"].map(cov)).toEqual([
      ...["0.01", "0.46"],
      ...["0.34", "0.51"],
    ]);
  });
});
// #endregion

// #region replay-test
// この章で測った記録（ch10）を、キー無しで同じ答え・同じ採点に戻す
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
beforeAll(async () => {
  await migrate(db);
  for (const [source, fetch] of Object.entries(FETCHERS)) {
    await syncSource(db, source, markAcl(markCanonical(await fetch())));
  }
});

describe("記録した評価を再生する", () => {
  it("54件とも、答えと採点が記録と同じ", async () => {
    const rows = readRows("eval/runs/ch10.jsonl");
    const qs = new Map(questions().map((q) => [q.id, q]));
    for (const r of rows) {
      const q = qs.get(r.qid)!;
      const a = await ask(db, q, r.rep);
      expect(a.hits.map((h) => h.docId)).toEqual(
        r.hits.map((h) => h.id),
      );
      const titles = a.hits.map((h) => h.title);
      expect(await judge(q, a.text, titles, r.rep)).toEqual(r.judge);
    }
  }, 60_000);
});
// #endregion

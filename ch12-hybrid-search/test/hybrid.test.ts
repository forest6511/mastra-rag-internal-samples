import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { markAcl } from "../src/acl.js";
import { markCanonical } from "../src/canonical.js";
import { ask, type Mode } from "../src/eval/ask.js";
import { judge } from "../src/eval/judge.js";
import { questions } from "../src/eval/questions.js";
import { readRows } from "../src/eval/summary.js";
import { FETCHERS } from "../src/fetch-all.js";
import { queryTerms, rrf } from "../src/hybrid.js";
import { migrate } from "../src/ingest.js";
import { syncSource } from "../src/sync.js";

// #region unit
describe("語の取り出しと RRF", () => {
  it("漢字・カタカナ・英数字の続きを語にする", () => {
    const q =
      "PGのタイムアウトって何msにしとくのが正解？3000で合ってる？";
    expect(queryTerms(q)).toEqual([
      "PG",
      "タイムアウト",
      "何ms",
      "正解",
      "3000",
    ]);
  });

  it("2つの順位の両方で上にあるチャンクが、いちばん上になる", () => {
    const c = (id: number) => ({ chunkId: id }) as never;
    const fused = rrf([
      [c(1), c(2), c(3)],
      [c(3), c(1)],
    ]);
    expect(fused.map((h: { chunkId: number }) => h.chunkId)).toEqual([
      1, 3, 2,
    ]);
  });
});
// #endregion

// #region replay
// 測った2つの作り（hybrid・rerank）の評価を、キー無しで再生する
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
beforeAll(async () => {
  await migrate(db);
  for (const [source, fetch] of Object.entries(FETCHERS)) {
    await syncSource(db, source, markAcl(markCanonical(await fetch())));
  }
});

describe.each(["hybrid", "rerank"] as Mode[])(
  "記録した評価（%s）",
  (mode) => {
    it("54件とも、材料・答え・採点が記録と同じ", async () => {
      const rows = readRows(`eval/runs/ch12-${mode}.jsonl`);
      const qs = new Map(questions().map((q) => [q.id, q]));
      for (const r of rows) {
        const q = qs.get(r.qid)!;
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

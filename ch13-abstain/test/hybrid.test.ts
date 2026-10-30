import { describe, expect, it } from "vitest";
import { queryTerms, rrf } from "../src/hybrid.js";

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

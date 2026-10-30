import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  handleMention,
  userOf,
  type Deps,
} from "../src/slack/handle.js";
import { splitForSlack, toMrkdwn } from "../src/slack/mrkdwn.js";

// #region mrkdwn-test
describe("Slack の書式", () => {
  it("リンク・太字・見出しを mrkdwn に直す", () => {
    const md = "## 結論\n**3年**です [1]\n[方針](https://x.example/p)";
    const z = "\u200b"; // ゼロ幅スペース
    expect(toMrkdwn(md)).toBe(
      `${z}*結論*${z}\n${z}*3年*${z}です [1]\n<https://x.example/p|方針>`,
    );
  });

  it("4,000 字を超える答えは段落の切れ目で分ける", () => {
    const parts = splitForSlack(
      ["あ".repeat(3000), "い".repeat(3000)].join("\n\n"),
    );
    expect(parts.map((p) => p.length)).toEqual([3000, 3000]);
  });
});
// #endregion

// #region handle-test
// Slack の代わりに、書いた内容を配列に残すだけの Deps を渡す
function fake(shared: boolean) {
  const posts: string[] = [];
  const logs: unknown[] = [];
  const deps: Deps = {
    isShared: async () => shared,
    post: async (_c, _t, text) => void posts.push(text),
    answer: async (user, q) => ({
      text: `**${user || "全社員"}** として「${q}」に答える`,
      hits: [{ docId: "confluence:622593" }],
    }),
    log: (e) => void logs.push(e),
  };
  return { deps, posts, logs };
}
const m = { user: "U0CDYS9H280", channel: "C1", ts: "1.0" };
// #endregion

// #region handle-cases

describe("メンションの処理", () => {
  it("先に「調べています」と返し、答えを書く", async () => {
    const f = fake(false);
    await handleMention({ ...m, text: "<@UBOT> ログは何年？" }, f.deps);
    expect(f.posts).toEqual([
      "調べています…",
      "\u200b*kobayashi*\u200b として「ログは何年？」に答える",
    ]);
    expect(f.logs).toHaveLength(1);
  });

  it("社外の人がいるチャンネルでは答えず、ログも残さない", async () => {
    const f = fake(true);
    await handleMention({ ...m, text: "<@UBOT> ログは何年？" }, f.deps);
    expect(f.posts).toEqual([
      "このチャンネルには社外の方がいるため、答えられません。",
    ]);
    expect(f.logs).toHaveLength(0);
  });

  it("対応表に無い人は、利用者の名前を空にする", () => {
    expect(userOf("U0CDYS9H280")).toBe("kobayashi");
    expect(userOf("UNKNOWN")).toBe("");
  });
});
// #endregion

// #region log-test
describe("質問ログ", () => {
  it("書くたびに、90日より古い行を消す", async () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "q-")),
      "q.jsonl",
    );
    process.env.QUESTION_LOG = file;
    const { writeLog } = await import("../src/slack/question-log.js");
    const e = { user: "U1", channel: "C1", question: "q", docIds: [] };
    writeLog(
      { ...e, at: "2026-07-01T00:00:00Z" },
      new Date("2026-07-01"),
    );
    writeLog(
      { ...e, at: "2026-10-30T00:00:00Z" },
      new Date("2026-10-30"),
    );
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines.map((l) => JSON.parse(l).at)).toEqual([
      "2026-10-30T00:00:00Z",
    ]);
  });
});
// #endregion

// #region answer-test
// ボットが答えに使う answerAs を、記録した応答でキー無しに動かす
// （第13章の Q10 と同じ質問・同じ利用者）
describe("answerAs", () => {
  it("記録した答えを返す", async () => {
    process.env.OFFLINE = "1";
    const { PGlite } = await import("@electric-sql/pglite");
    const { vector } = await import("@electric-sql/pglite-pgvector");
    const { migrate } = await import("../src/ingest.js");
    const { syncSource } = await import("../src/sync.js");
    const { FETCHERS } = await import("../src/fetch-all.js");
    const { markAcl } = await import("../src/acl.js");
    const { markCanonical } = await import("../src/canonical.js");
    const { answerAs } = await import("../src/answer-as.js");
    const db = new PGlite({ extensions: { vector } });
    await migrate(db);
    for (const [source, fetch] of Object.entries(FETCHERS)) {
      await syncSource(
        db,
        source,
        markAcl(markCanonical(await fetch())),
      );
    }
    const q =
      "障害があったとき、お客様へのご連絡って" +
      "いつまでにする決まりでしたっけ？";
    const r = await answerAs("nakamura", q, db);
    expect(r.text.startsWith("確度: 資料で確かめられた")).toBe(true);
    expect(r.hits).toHaveLength(6);
  }, 60_000);
});
// #endregion

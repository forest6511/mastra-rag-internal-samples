import { describe, expect, it } from "vitest";
import { loadCorpus, loadWorld } from "../src/corpus.js";
import { buildJiraCsv } from "../src/seed/jira-csv.js";
import { buildSlackExport, toTs } from "../src/seed/slack-export.js";

const world = loadWorld();
const docs = loadCorpus();

describe("Jira の CSV", () => {
  const csv = buildJiraCsv(docs, world, "ACCOUNT");
  const lines = csv.trim().split("\n");

  it("見出しに Created・Resolved・Comment の列がある", () => {
    expect(lines[0]).toContain('"Created","Resolved"');
    expect(lines[0]).toContain('"Comment"');
  });

  it("コメントは「日時;アカウント;（社員名）本文」の形", () => {
    expect(csv).toMatch(/"2026-\d\d-\d\d \d\d:\d\d;ACCOUNT;（[^）]+）/);
  });
});

describe("Slack のエクスポート形式", () => {
  it("日本時間の 2026-09-15 10:02 は UTC の 01:02", () => {
    const ts = toTs("2026-09-15 10:02", 0);
    expect(new Date(Number(ts) * 1000).toISOString()).toBe(
      "2026-09-15T01:02:00.000Z",
    );
  });

  it("返信は親の ts を thread_ts に持つ", () => {
    const files = buildSlackExport(docs, world);
    const msgs = [...files.entries()]
      .filter(([p]) => p.includes("/"))
      .flatMap(([, v]) => v as { ts: string; thread_ts?: string }[]);
    const parents = new Set(msgs.map((m) => m.ts));
    const replies = msgs.filter(
      (m) => m.thread_ts && m.thread_ts !== m.ts,
    );
    expect(replies.length).toBeGreaterThan(0);
    for (const r of replies) expect(parents).toContain(r.thread_ts);
  });
});

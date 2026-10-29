import { describe, expect, it } from "vitest";
import { loadCorpus, loadWorld } from "../src/corpus.js";

const world = loadWorld();
const docs = loadCorpus();

describe("seed の資料", () => {
  it("25件あり、どれも世界設定の出来事と人物に結び付く", () => {
    expect(docs).toHaveLength(25);
    const events = new Set(world.timeline.map((e) => e.id));
    const people = new Set(world.people.map((p) => p.id));
    for (const d of docs) {
      expect(events, d.plan.id).toContain(d.plan.event);
      expect(people, d.plan.id).toContain(d.plan.author);
    }
  });

  it("本文に世界設定の記号（E2 など）が無い", () => {
    for (const d of docs) {
      const { plan, ...body } = d;
      expect(JSON.stringify(body), plan.id).not.toMatch(/\b[EN]\d\b/);
    }
  });

  it("資料にメールアドレスやトークンの形の文字列が無い", () => {
    const text = JSON.stringify(docs);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/);
    expect(text).not.toMatch(/(xox[abp]-|ghp_|github_pat_|ATATT)/);
  });
});

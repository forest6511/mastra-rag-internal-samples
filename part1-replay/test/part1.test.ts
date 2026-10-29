import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { answer } from "../src/agent.js";
import { buildDb } from "../src/build.js";
import { addCanonical } from "../src/canonical.js";
import { embed } from "../src/embed.js";
import { docSearch } from "../src/search.js";

// 第1部の完成品が、キー無しで本書と同じ答えを返すことを確かめる
process.env.OFFLINE = "1";
const q = (id: string) =>
  readFileSync(`out/question-${id}.txt`, "utf8");
let db: Awaited<ReturnType<typeof buildDb>>;
const ask = async (question: string) => {
  const [v] = await embed([question]);
  const hits = await addCanonical(db, question, await docSearch(db, v));
  return answer(question, hits);
};

beforeAll(async () => {
  db = await buildDb();
});

describe("第1部の成果物", () => {
  it.each(["Q01", "Q04", "Q07", "Q13", "Q16", "weekly"])(
    "%s は記録から答え、out/ の答えと同じ",
    async (id) => {
      const text = await ask(q(id));
      expect(readFileSync(`out/answer-${id}.txt`, "utf8")).toContain(
        text,
      );
    },
  );

  it("振り返りの下書きに、原因の 3000ms が入る", async () => {
    expect(await ask(q("Q01"))).toContain("3000");
  });
});

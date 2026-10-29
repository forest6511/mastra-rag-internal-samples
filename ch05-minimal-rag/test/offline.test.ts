import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { answer } from "../src/agent.js";
import { embed } from "../src/embed.js";
import { migrate, saveDoc } from "../src/ingest.js";
import { vectorSearch } from "../src/search.js";
import { confluenceDocs } from "../src/sources/confluence.js";

// 記録した応答（records/）だけで、取り込みから答えまでを通す。
// アカウントも API キーも要らない
process.env.OFFLINE = "1";
const db = new PGlite({ extensions: { vector } });
const question = "デプロイ手順は？";

beforeAll(async () => {
  await migrate(db);
  for (const d of await confluenceDocs("KANADE")) await saveDoc(db, d);
});

describe("記録した応答で、最小の RAG を通す", () => {
  it("いちばん近いチャンクは、古いデプロイ手順書", async () => {
    const [v] = await embed([question]);
    const hits = await vectorSearch(db, v);
    expect(hits).toHaveLength(6);
    expect(hits[0].title).toBe("デプロイ手順（本番環境）");
  });

  it("答えは古い手順（deploy.sh）を、出典 [1] 付きで返す", async () => {
    const [v] = await embed([question]);
    const text = await answer(question, await vectorSearch(db, v));
    expect(text).toContain("deploy.sh");
    expect(text).toContain("[1]");
    expect(text).not.toContain("GitHub Actions");
  });
});

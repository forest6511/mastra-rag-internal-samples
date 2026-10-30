import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { MCPClient } from "@mastra/mcp";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { markAcl } from "../src/acl.js";
import { markCanonical } from "../src/canonical.js";
import { FETCHERS } from "../src/fetch-all.js";
import { migrate } from "../src/ingest.js";
import { tokenOf, userOfToken } from "../src/mcp/auth.js";
import { listen } from "../src/mcp/server.js";
import { syncSource } from "../src/sync.js";

// #region auth-test
describe("トークン", () => {
  process.env.MCP_TOKEN_NAKAMURA = "token-for-nakamura";
  it("ヘッダーとパスのどちらからも取り出す", () => {
    expect(tokenOf("/mcp", "Bearer abc")).toBe("abc");
    expect(tokenOf("/mcp/abc", undefined)).toBe("abc");
    expect(tokenOf("/mcp", undefined)).toBe("");
  });
  it("トークンから利用者を引き、知らないトークンは null", () => {
    expect(userOfToken("token-for-nakamura")).toBe("nakamura");
    expect(userOfToken("wrong")).toBeNull();
  });
});
// #endregion

// #region setup
// 記録した応答で DB を作り、手元のポートで MCP サーバーを立てる
process.env.OFFLINE = "1";
const PORT = 18787;
const base = `http://localhost:${PORT}/mcp`;
let http: Server;
beforeAll(async () => {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db);
  for (const [source, fetch] of Object.entries(FETCHERS)) {
    await syncSource(db, source, markAcl(markCanonical(await fetch())));
  }
  http = listen(PORT, db);
}, 60_000);
afterAll(() => http.close());

// MCP のクライアントで、中村さんのトークンを付けてつなぐ
const client = (id: string, legacy = false) =>
  new MCPClient({
    id,
    servers: {
      kanade: {
        url: new URL(base),
        requestInit: {
          headers: { Authorization: "Bearer token-for-nakamura" },
        },
        ...(legacy ? { protocolVersion: "legacy" as const } : {}),
      },
    },
  });
// ツールの結果は MCP の形（content[0].text に JSON の文字列）で返る
const body = (r: unknown) =>
  JSON.parse((r as { content: { text: string }[] }).content[0].text);
// #endregion

// #region protocol-test
// 新しい接続方法（2026-07-28）と古い方法（legacy）の両方でつながり、
// 同じ search の結果が返る
const Q =
  "障害があったとき、お客様へのご連絡っていつまでにする決まりでしたっけ？";
describe.each([
  ["新しい方法", false, "2026-07-28"],
  ["古い方法", true, "2025-11-25"],
] as const)("MCP（%s）", (_name, legacy, version) => {
  it("つながり、search が6件返る", async () => {
    const c = client(`test-${version}`, legacy);
    try {
      const tools = await c.listTools();
      const search = tools.kanade_search;
      const r = body(await search.execute!({ query: Q }, {} as never));
      expect(c.getServerProtocolVersions().kanade).toBe(version);
      expect(r.results).toHaveLength(6);
    } finally {
      await c.disconnect();
    }
  }, 30_000);
});
// #endregion

// #region permission-test
describe("権限", () => {
  it("トークン無しは 401 で断る", async () => {
    const res = await fetch(base, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("営業の中村さんが人事のメモを fetch しても「見つかりません」", async () => {
    const c = client("test-fetch");
    try {
      const tools = await c.listTools();
      const hr = "notion:4087551e-201a-8177-8334-d19a55d2d195";
      const r = body(
        await tools.kanade_fetch.execute!({ id: hr }, {} as never),
      );
      expect(r).toMatchObject({ title: "見つかりません", text: "" });
    } finally {
      await c.disconnect();
    }
  }, 30_000);
});
// #endregion

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

// #endregion

// #region setup-client
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
// 出力の形（outputSchema）を宣言したツールの結果は、Mastra の
// クライアントが structuredContent を取り出して返す
const body = (r: unknown) => r as Record<string, never>;
// #endregion

// #region protocol-test
// 新しい接続方法（2026-07-28）と古い方法（legacy）の両方でつながり、
// 同じ search の結果が返る
const Q =
  "障害があったとき、お客様へのご連絡って" +
  "いつまでにする決まりでしたっけ？";
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

  it("中村さんの人事のメモの fetch は「見つかりません」", async () => {
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

// #region wire-test
// HTTP で直接呼び、サーバーが structuredContent と、同じ値の JSON の
// 文字列（content）の両方を返すことを確かめる（古い方法で1回だけ呼ぶ）
it("structuredContent と content の両方を返す", async () => {
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-for-nakamura",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({
      ...{ jsonrpc: "2.0", id: 1, method: "tools/call" },
      params: { name: "fetch", arguments: { id: "jira:KAN-10" } },
    }),
  });
  const text = await res.text();
  const json = JSON.parse(text.replace(/^[\s\S]*?data: /, "").trim());
  const r = json.result;
  expect(r.structuredContent.title).toContain("KAN-10");
  expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent);
});
// #endregion

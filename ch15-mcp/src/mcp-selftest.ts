import { MCPClient } from "@mastra/mcp";

// #region main
// npm run mcp-selftest
// 手元の MCP サーバーを、MCP のクライアントで呼んで確かめる。
// 新しい方法と古い方法（legacy）・利用者2人・トークン無し
const base = `http://localhost:${process.env.MCP_PORT ?? 8787}/mcp`;
const q = process.argv[2] ?? "障害の連絡はいつまでにする決まり？";
const hr = "notion:4087551e-201a-8177-8334-d19a55d2d195"; // 人事のメモ
// 出力の形を宣言したツールは、structuredContent がそのまま返る
type Doc = { title: string };
const body = <T>(r: unknown) => r as T;

for (const [user, legacy] of [
  ["KOBAYASHI", false],
  ["KOBAYASHI", true],
  ["NAKAMURA", false],
] as const) {
  const c = new MCPClient({
    id: `selftest-${user}-${legacy}`,
    servers: {
      kanade: {
        url: new URL(base),
        requestInit: {
          headers: {
            Authorization: `Bearer ${process.env[`MCP_TOKEN_${user}`]}`,
          },
        },
        ...(legacy ? { protocolVersion: "legacy" as const } : {}),
      },
    },
  });
  const t = await c.listTools();
  const s = body<{ results: Doc[] }>(
    await t.kanade_search.execute!({ query: q }, {} as never),
  );
  const f = body<Doc>(
    await t.kanade_fetch.execute!({ id: hr }, {} as never),
  );
  const v = c.getServerProtocolVersions().kanade;
  console.log(
    `${user.toLowerCase()}・${v}: search ${s.results.length} 件`,
  );
  for (const r of s.results) console.log(`  ${r.title}`);
  console.log(`  fetch（人事のメモ）: ${f.title}`);
  await c.disconnect();
}
const res = await fetch(base, { method: "POST", body: "{}" });
console.log(`トークン無し: HTTP ${res.status}`);
// #endregion

import http from "node:http";
import { MCPServer } from "@mastra/mcp";
import { asUser } from "../db.js";
import { tokenOf, userOfToken } from "./auth.js";
import { fetchTool, searchTool } from "./tools.js";

type Db = Parameters<typeof asUser>[2];

// #region mcp-server
// search と fetch の2つのツールを持つ MCP サーバー。Mastra MCP 2.x の
// サーバーは 2026-07-28 版の接続方法だけを受けるので、2025年版の
// 方法（initialize から始める）で来るクライアント用に legacy を付ける
export function mcpServer(db?: Db) {
  return new MCPServer({
    id: "kanade-rag",
    name: "カナデループ社内検索",
    version: "0.1.0",
    description: "カナデループの社内資料を、権限どおりに検索する",
    tools: { search: searchTool(db), fetch: fetchTool(db) },
    legacy: "stateless",
  });
}
// #endregion

// #region http
// HTTP の入口。トークンから利用者を決め、無ければ 401 で断る。
// 利用者の名前を req.auth に入れると、ツールの中で読める
export function listen(port: number, db?: Db) {
  const server = mcpServer(db);
  return http
    .createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (!/^\/mcp(\/[\w-]+)?\/?$/.test(url.pathname)) {
        res.writeHead(404).end();
        return;
      }
      // #endregion
      // #region http-auth
      const user = userOfToken(
        tokenOf(url.pathname, req.headers.authorization),
      );
      if (!user) {
        res.writeHead(401, { "WWW-Authenticate": "Bearer" }).end();
        return;
      }
      Object.assign(req, {
        auth: {
          token: "",
          clientId: user,
          scopes: [],
          extra: { user },
        },
      });
      await server.startHTTP({
        ...{ url, httpPath: url.pathname, req, res },
        options: {
          enableDnsRebindingProtection: true,
          allowedHosts: ["localhost", "127.0.0.1"],
        },
      });
    })
    .listen(port, "127.0.0.1");
}
// #endregion

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { groupsOf } from "../acl.js";
import { addCanonical } from "../canonical.js";
import { asUser } from "../db.js";
import { embed } from "../embed.js";
import { fetchDoc } from "../fetch-doc.js";
import { hybridSearch } from "../hybrid.js";

type Db = Parameters<typeof asUser>[2];

// #region caller
// ツールを呼んだ利用者。MCP サーバーの入口（server.ts）が
// req.auth に入れた値が、context.mcp.extra.authInfo に届く
type Ctx = { mcp?: { extra?: { authInfo?: { extra?: unknown } } } };
const callerOf = (ctx: Ctx) => {
  const extra = ctx.mcp?.extra?.authInfo?.extra as
    { user?: string } | undefined;
  if (!extra?.user) throw new Error("認証されていない呼び出しです");
  return extra.user;
};
// #endregion

// #region search
// search: 質問に近い資料を返す。答えは書かない（書くのは呼んだ側の
// Claude・ChatGPT のモデル）。結果の形は ChatGPT の search に合わせ、
// outputSchema で形を宣言する（structuredContent でも返る）
export const searchTool = (db?: Db) =>
  createTool({
    id: "search",
    description:
      "株式会社カナデループの社内資料（Confluence・Jira・Notion・" +
      "Slack・GitHub）を検索する。日本語の質問をそのまま渡す。",
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          ...{ id: z.string(), title: z.string(), url: z.string() },
          text: z.string(),
        }),
      ),
    }),
    // #endregion
    // #region search-run
    execute: async ({ query }, ctx) => {
      const user = callerOf(ctx as Ctx);
      const [v] = await embed([query]);
      const hits = await asUser(
        groupsOf(user),
        async (c) =>
          addCanonical(c, query, await hybridSearch(c, query, v)),
        db,
      );
      // 渡ってきた質問の文と返した資料の ID を、ログに1行で出す
      const ids = hits.map((h) => h.docId);
      console.log(JSON.stringify({ tool: "search", user, query, ids }));
      const results = hits.map((h) => ({
        ...{ id: h.docId, title: h.title, url: h.url },
        text: h.content.slice(0, 300),
      }));
      return { results };
    },
  });
// #endregion

// #region fetch
// fetch: search が返した id の資料の本文を返す。ここでも権限を通す。
// 見えない資料は「見つからない」と同じに返し、資料があることを言わない
export const fetchTool = (db?: Db) =>
  createTool({
    id: "fetch",
    description: "search が返した id の資料の本文を取得する。",
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({
      ...{ id: z.string(), title: z.string() },
      ...{ text: z.string(), url: z.string() },
    }),
    execute: async ({ id }, ctx) => {
      const user = callerOf(ctx as Ctx);
      const d = await asUser(
        groupsOf(user),
        (c) => fetchDoc(c, id),
        db,
      );
      if (!d) return { id, title: "見つかりません", text: "", url: "" };
      return { id, title: d.title, text: d.body, url: d.url };
    },
  });
// #endregion

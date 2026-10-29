import { execFileSync } from "node:child_process";
import { need } from "./env.js";
import { request } from "./http.js";
import { atlassianHeaders } from "./seed/confluence.js";

// 5つのサービスに資料が入ったかを、それぞれの API で数える（書き込みはしない）

// #region confluence-jira
async function confluencePages(): Promise<number> {
  const site = need("ATL_SITE");
  const headers = atlassianHeaders();
  const sp = await request<{ results: { id: string }[] }>(
    `${site}/wiki/api/v2/spaces?keys=KANADE`,
    { headers },
  );
  const pages = await request<{ results: unknown[] }>(
    `${site}/wiki/api/v2/spaces/${sp.results[0].id}/pages?limit=250`,
    { headers },
  );
  return pages.results.length;
}

async function jiraIssues(): Promise<number> {
  const res = await request<{ issues: unknown[] }>(
    `${need("ATL_SITE")}/rest/api/3/search/jql`,
    {
      method: "POST",
      headers: atlassianHeaders(),
      body: JSON.stringify({
        jql: "project = KAN",
        maxResults: 100,
        fields: ["summary"],
      }),
    },
  );
  return res.issues.length;
}
// #endregion

// #region notion
// 親ページから子ページをたどって数える（Notion の検索 API は、
// 作ったばかりのページを十数秒返さないため使わない）
async function notionPages(
  id = need("NOTION_ROOT_PAGE"),
): Promise<number> {
  const res = await request<{
    results: { id: string; type: string }[];
  }>(`https://api.notion.com/v1/blocks/${id}/children?page_size=100`, {
    headers: {
      Authorization: `Bearer ${need("NOTION_TOKEN")}`,
      "Notion-Version": "2022-06-28",
    },
  });
  let n = 0;
  for (const b of res.results.filter((b) => b.type === "child_page")) {
    n += 1 + (await notionPages(b.id));
  }
  return n;
}
// #endregion

// #region slack-github
async function slackMessages(): Promise<number> {
  const get = <T>(method: string, params: Record<string, string>) =>
    request<T>(
      `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
      { headers: { Authorization: `Bearer ${need("SLACK_TOKEN")}` } },
    );
  const list = await get<{ channels: { id: string }[] }>(
    "conversations.list",
    { types: "public_channel,private_channel", limit: "200" },
  );
  let n = 0;
  for (const ch of list.channels) {
    const h = await get<{ messages?: unknown[] }>(
      "conversations.history",
      {
        channel: ch.id,
        limit: "1000",
      },
    );
    n += h.messages?.length ?? 0;
  }
  return n;
}

function githubRepos(): number {
  const out = execFileSync(
    "gh",
    ["repo", "list", need("GH_ORG"), "--json", "name"],
    {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: need("GH_RAG_TOKEN") },
    },
  );
  return JSON.parse(out).length;
}
// #endregion

// #region main
console.log("Confluence のページ:", await confluencePages());
console.log("Jira の課題:", await jiraIssues());
console.log("Notion のページ:", await notionPages());
console.log("Slack の投稿（スレッドの親）:", await slackMessages());
console.log("GitHub の repo:", githubRepos());
// #endregion

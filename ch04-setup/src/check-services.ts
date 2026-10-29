import { execFileSync } from "node:child_process";
import { loadCorpus, ofKind, type SeedDoc } from "./corpus.js";
import { need } from "./env.js";
import { request } from "./http.js";
import { atlassianHeaders } from "./seed/confluence.js";
import { toTs } from "./seed/slack-export.js";
import { channelIds, slackApi } from "./slack.js";

// 5つのサービスに、seed の資料が入ったかを確かめる
// （書き込みはしない）。
// 資料の題名などを各サービスの API の結果と突き合わせ、
// 「期待した件数のうち、見つかった件数」を出す

// #region report
const docs = loadCorpus();
function report(service: string, expected: string[], found: string[]) {
  const have = new Set(found);
  const missing = expected.filter((e) => !have.has(e));
  const n = expected.length - missing.length;
  console.log(`${service}: ${n}/${expected.length}`);
  for (const m of missing) console.log(`  見つからない: ${m}`);
}
const titles = (kind: string, key = "title") =>
  ofKind(docs, kind).map((d: SeedDoc) => String(d[key]));
// #endregion

// #region confluence-jira
async function atlassian() {
  const site = need("ATL_SITE");
  const headers = atlassianHeaders();
  const sp = await request<{ results: { id: string }[] }>(
    `${site}/wiki/api/v2/spaces?keys=KANADE`,
    { headers },
  );
  const pages = await request<{ results: { title: string }[] }>(
    `${site}/wiki/api/v2/spaces/${sp.results[0].id}/pages?limit=250`,
    { headers },
  );
  report(
    "Confluence",
    titles("confluence-page"),
    pages.results.map((p) => p.title),
  );
  const jira = await request<{
    issues: { fields: { summary: string } }[];
  }>(`${site}/rest/api/3/search/jql`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jql: "project = KAN",
      maxResults: 100,
      fields: ["summary"],
    }),
  });
  const summaries = jira.issues.map((i) => i.fields.summary);
  report("Jira", titles("jira-issue", "summary"), summaries);
}
// #endregion

// #region notion
// 親ページから子ページをたどり、ページの題名を集める（Notion の検索の
// API は、作ったばかりのページを十数秒返さないため使わない）
async function notionTitles(id: string): Promise<string[]> {
  const res = await request<{
    results: {
      id: string;
      type: string;
      child_page?: { title: string };
    }[];
  }>(`https://api.notion.com/v1/blocks/${id}/children?page_size=100`, {
    headers: {
      Authorization: `Bearer ${need("NOTION_TOKEN")}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const out: string[] = [];
  for (const b of res.results.filter((b) => b.child_page)) {
    out.push(b.child_page?.title ?? "", ...(await notionTitles(b.id)));
  }
  return out;
}
// #endregion

// #region slack
// スレッドの親の投稿（資料1件の最初の投稿）が、チャンネルにあるかを
// 投稿の時刻（ts）で見る。本文は Slack が絵文字を :rice: のような
// 書き方に変えて保存するので、本文の一致では探さない
async function slack() {
  const ids = await channelIds();
  const found: string[] = [];
  const expected = ofKind(docs, "slack-thread").map((d) => d.plan.id);
  for (const d of ofKind(docs, "slack-thread")) {
    const first = toTs((d.messages as { at: string }[])[0].at, 0);
    const id = ids.get(String(d.plan.channel)) ?? "";
    const h = await slackApi<{ messages: { ts: string }[] }>(
      "conversations.history",
      { channel: id, limit: "1000" },
    );
    if (h.messages.some((m) => m.ts === first)) found.push(d.plan.id);
  }
  report("Slack", expected, found);
}
// #endregion

// #region github
// README はリポジトリの有無、PR は題名で突き合わせる
function github() {
  const gh = (args: string[]) =>
    execFileSync("gh", args, {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: need("GH_RAG_TOKEN") },
    }).trim();
  const org = need("GH_ORG");
  const repos = gh([
    "repo",
    "list",
    org,
    "--json",
    "name",
    "-q",
    ".[].name",
  ]);
  report(
    "GitHub の README",
    ofKind(docs, "github-readme").map((d) => String(d.plan.repo)),
    repos.split("\n"),
  );
  // #endregion
  // #region github-pr
  const prRepos = new Set(
    ofKind(docs, "github-pr").map((d) => String(d.plan.repo)),
  );
  const found = [...prRepos].flatMap((repo) =>
    gh([
      ...["pr", "list", "-R", `${org}/${repo}`, "--state", "all"],
      ...["--json", "title", "-q", ".[].title"],
    ]).split("\n"),
  );
  report("GitHub の PR", titles("github-pr"), found);
}
// #endregion

// #region main
await atlassian();
report(
  "Notion",
  titles("notion-page"),
  await notionTitles(need("NOTION_ROOT_PAGE")),
);
await slack();
github();
// #endregion

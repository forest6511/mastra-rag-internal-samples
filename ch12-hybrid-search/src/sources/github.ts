import { eventDateOf, type Doc } from "../doc.js";
import { need } from "../env.js";
import { getJson, offline } from "../record.js";

// #region gh-get
// GitHub の REST API。読むだけのトークン（fine-grained）で呼ぶ
// keep で、記録に残す項目を選ぶ（投稿者のアカウント名は残さない）
const ghGet = <T>(name: string, url: string, keep: (j: T) => T) =>
  getJson<T>(
    name,
    url,
    {
      headers: offline()
        ? {}
        : {
            Authorization: `Bearer ${need("GH_RAG_TOKEN")}`,
            Accept: "application/vnd.github+json",
          },
    },
    keep,
  );
// #endregion

interface Repo {
  name: string;
}
interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  comments: number;
  comments_url: string;
  created_at: string;
  pull_request?: { merged_at: string | null };
}

// #region keep-issue
const keepIssue = (i: Issue): Issue => ({
  number: i.number,
  title: i.title,
  body: i.body,
  state: i.state,
  html_url: i.html_url,
  comments: i.comments,
  comments_url: i.comments_url,
  created_at: i.created_at,
  ...(i.pull_request
    ? { pull_request: { merged_at: i.pull_request.merged_at } }
    : {}),
});
// #endregion

// #region readme
// リポジトリの README。無いリポジトリは 404 になるので飛ばす
async function readme(org: string, repo: string): Promise<Doc[]> {
  try {
    const rd = await ghGet<{ content: string; html_url: string }>(
      `gh-readme-${repo}`,
      `https://api.github.com/repos/${org}/${repo}/readme`,
      ({ content, html_url }) => ({ content, html_url }),
    );
    const body = Buffer.from(rd.content, "base64").toString("utf8");
    return [
      {
        id: `github:${repo}:README`,
        source: "github",
        url: rd.html_url,
        title: `${repo} README`,
        container: `github:${repo}`,
        body,
        eventDate: eventDateOf(body),
      },
    ];
  } catch (e) {
    if (String(e).includes("HTTP 404")) return [];
    throw e;
  }
}
// #endregion

// #region issues
// Issue と PR は同じ API で取れる（pull_request があれば PR）。
// state=all で、閉じたものとマージ済みのものも取る
async function issues(org: string, repo: string): Promise<Doc[]> {
  const list = await ghGet<Issue[]>(
    `gh-issues-${repo}`,
    `https://api.github.com/repos/${org}/${repo}/issues` +
      "?state=all&per_page=100",
    (list) => list.map(keepIssue),
  );
  const docs: Doc[] = [];
  for (const i of list) {
    const kind = i.pull_request ? "PR" : "Issue";
    const merged = i.pull_request?.merged_at ? "（マージ済み）" : "";
    const body = i.body ?? "";
    docs.push({
      id: `github:${repo}:${i.number}`,
      source: "github",
      url: i.html_url,
      title: `${repo} ${kind} #${i.number} ${i.title}`,
      container: `github:${repo}`,
      body: [
        `状態: ${i.state}${merged}`,
        body,
        await comments(repo, i),
      ].join("\n"),
      eventDate: eventDateOf(body),
    });
  }
  return docs;
}
// #endregion

// #region comments
// コメントは Issue・PR ごとに別の API。本文の後ろに足す。
// API の日時は seed を入れた日なので付けない（日時は本文の頭にある）
async function comments(repo: string, i: Issue): Promise<string> {
  if (i.comments === 0) return "";
  const list = await ghGet<{ created_at: string; body: string }[]>(
    `gh-comments-${repo}-${i.number}`,
    i.comments_url,
    (list) =>
      list.map(({ created_at, body }) => ({ created_at, body })),
  );
  const lines = list.map((c) => c.body);
  return `コメント:\n${lines.join("\n")}`;
}
// #endregion

// #region github-docs
export async function githubDocs(org: string): Promise<Doc[]> {
  const repos = await ghGet<Repo[]>(
    `gh-repos-${org}`,
    `https://api.github.com/orgs/${org}/repos?per_page=100`,
    (list) => list.map(({ name }) => ({ name })),
  );
  const docs: Doc[] = [];
  for (const r of repos) {
    docs.push(
      ...(await readme(org, r.name)),
      ...(await issues(org, r.name)),
    );
  }
  return docs;
}
// #endregion

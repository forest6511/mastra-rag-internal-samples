import { eventDateOf, type Doc } from "../doc.js";
import { need } from "../env.js";
import { getJson, offline, RECORDED_SITE } from "../record.js";

// #region adf
// Jira の説明とコメントは ADF（Atlassian Document Format）という
// JSON の木で返る。木をたどって文字だけを集め、段落の終わりで改行する
interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}
const BLOCKS = ["paragraph", "heading", "listItem", "codeBlock"];

export function adfText(n: AdfNode | null | undefined): string {
  if (!n) return "";
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(adfText).join("");
  return BLOCKS.includes(n.type ?? "") ? inner + "\n" : inner;
}
// #endregion

interface Issue {
  key: string;
  fields: {
    summary: string;
    description: AdfNode | null;
    created: string;
    resolutiondate: string | null;
    issuetype: { name: string };
    status: { name: string };
    comment: { comments: { created: string; body: AdfNode }[] };
  };
}

// #region keep-issue
// 記録に残すのは、使う項目だけ（報告者のアカウントなどは残さない）
const FIELDS = [
  ...["summary", "description", "comment", "created"],
  ...["issuetype", "status", "resolutiondate"],
];
const keep = (j: { issues: Issue[]; nextPageToken?: string }) => ({
  nextPageToken: j.nextPageToken,
  issues: j.issues.map(({ key, fields: f }) => ({
    key,
    fields: {
      ...f,
      issuetype: { name: f.issuetype.name },
      status: { name: f.status.name },
      comment: {
        comments: f.comment.comments.map(({ created, body }) => ({
          created,
          body,
        })),
      },
    },
  })),
});
// #endregion

// #region changed-jql
// 差分で取るときの JQL。前回の同期の時刻から5分戻して重ねて取る
// （時計のずれや、同期の最中に更新された課題を取りこぼさないため）。
// 日時は「何分前から」で書く（"-90m"）。日付と時刻で書くと、
// API トークンのアカウントのタイムゾーンで解釈されるため。
// 消えた課題は返らないので、削除は全件の突き合わせで見る
export function changedJql(
  project: string,
  since?: Date,
  now = new Date(),
): string {
  if (!since) return `project = ${project} ORDER BY created ASC`;
  const minutes =
    Math.ceil((now.getTime() - since.getTime()) / 60_000) + 5;
  return (
    `project = ${project} AND updated >= "-${minutes}m" ` +
    "ORDER BY updated ASC"
  );
}
// #endregion

// #region jira-docs
// JQL で課題を取る。100件ごとに nextPageToken で続きを取る。
// since を渡すと、その時刻以降に更新された課題だけを取る
export async function jiraDocs(
  project: string,
  since?: Date,
): Promise<Doc[]> {
  const site = offline() ? RECORDED_SITE : need("ATL_SITE");
  const docs: Doc[] = [];
  let token: string | undefined;
  for (let n = 0; n === 0 || token; n++) {
    const res = await getJson(
      `jira-${project}-${n}`,
      `${site}/rest/api/3/search/jql`,
      {
        method: "POST",
        headers: offline() ? {} : jiraHeaders(),
        body: JSON.stringify({
          jql: changedJql(project, since),
          maxResults: 100,
          nextPageToken: token,
          fields: FIELDS,
        }),
      },
      keep,
    );
    for (const i of res.issues) {
      docs.push({ ...toDoc(site, i), container: `jira:${project}` });
    }
    token = res.nextPageToken;
  }
  return docs;
}
// #endregion

// #region to-doc
function toDoc(site: string, i: Issue): Doc {
  const f = i.fields;
  const description = adfText(f.description).trim();
  const comments = f.comment.comments.map(
    (c) => `[${jst(c.created)}] ${adfText(c.body).trim()}`,
  );
  const resolved = f.resolutiondate
    ? ` / 解決: ${jst(f.resolutiondate)}`
    : "";
  return {
    id: `jira:${i.key}`,
    source: "jira",
    url: `${site}/browse/${i.key}`,
    title: `${i.key} ${f.summary}`,
    body: [
      `種別: ${f.issuetype.name} / 状態: ${f.status.name}`,
      `作成: ${jst(f.created)}${resolved}`,
      description,
      comments.length > 0 ? `コメント:\n${comments.join("\n")}` : "",
    ].join("\n"),
    eventDate: eventDateOf(description) ?? jst(f.created).slice(0, 10),
  };
}
// #endregion

// #region jst
// Jira の日時（"2026-09-15T10:30:00.000+0900"）を
// 日本時間の「2026-09-15 10:30」にする
const jst = (s: string) =>
  new Date(new Date(s).getTime() + 9 * 3600e3)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

function jiraHeaders(): Record<string, string> {
  const pair = `${need("ATL_EMAIL")}:${need("ATL_TOKEN")}`;
  return {
    Authorization: "Basic " + Buffer.from(pair).toString("base64"),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
// #endregion

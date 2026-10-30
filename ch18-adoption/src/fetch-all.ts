import type { Doc } from "./doc.js";
import { need } from "./env.js";
import { offline } from "./record.js";
import { confluenceDocs } from "./sources/confluence.js";
import { filesDocs } from "./sources/files.js";
import { githubDocs } from "./sources/github.js";
import { jiraDocs } from "./sources/jira.js";
import { notionDocs } from "./sources/notion.js";
import { slackThreadDocs } from "./sources/slack.js";

// #region fetchers
// サービスごとに、全件を取り直す関数。記録で動かすときは、
// 記録を取った環境の値（GitHub の組織・Notion の親ページ）を使う
const org = () => (offline() ? "kanadeloop" : need("GH_ORG"));
const root = () =>
  offline()
    ? "4087551e-201a-80d7-a71a-ea04d9805912"
    : need("NOTION_ROOT_PAGE");
const workspace = () => process.env.SLACK_WORKSPACE ?? "kanadeloop";

export const FETCHERS: Record<string, () => Promise<Doc[]>> = {
  confluence: () => confluenceDocs("KANADE"),
  github: () => githubDocs(org()),
  jira: () => jiraDocs("KAN"),
  slack: () => slackThreadDocs(workspace()),
  notion: () => notionDocs(root()),
  // 第18章: FILES_DIR を付けると、フォルダの Markdown も取り込む
  ...(process.env.FILES_DIR
    ? { files: async () => filesDocs(process.env.FILES_DIR!) }
    : {}),
};
// #endregion

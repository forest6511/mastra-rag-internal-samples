import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { markCanonical } from "./canonical.js";
import type { Doc } from "./doc.js";
import { migrate, saveDoc } from "./ingest.js";
import { confluenceDocs } from "./sources/confluence.js";
import { githubDocs } from "./sources/github.js";
import { jiraDocs } from "./sources/jira.js";
import { notionDocs } from "./sources/notion.js";
import { slackThreadDocs } from "./sources/slack.js";

// 第1部の完成品。記録した5つのサービスの資料を、Node の中で動く
// PostgreSQL（PGlite）に毎回取り込む。Docker もアカウントも要らない
export async function allDocs(): Promise<Doc[]> {
  return markCanonical([
    ...(await confluenceDocs("KANADE")),
    ...(await githubDocs("kanadeloop")),
    ...(await jiraDocs("KAN")),
    ...(await slackThreadDocs("kanadeloop")),
    ...(await notionDocs("4087551e-201a-80d7-a71a-ea04d9805912")),
  ]);
}

export async function buildDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } });
  await migrate(db);
  for (const d of await allDocs()) await saveDoc(db, d);
  return db;
}

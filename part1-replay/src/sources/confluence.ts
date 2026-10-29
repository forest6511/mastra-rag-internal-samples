import { eventDateOf, type Doc } from "../doc.js";
import { need } from "../env.js";
import {
  getJson,
  RECORDED_SITE,
  sourcesFromRecords,
} from "../record.js";

// #region html-text
// Confluence の本文（storage 形式の HTML）から文字だけを取り出す。
// 段落と見出しの終わりは空行、箇条書きと表の行の終わりは改行にして、
// 文章の区切りを残す（チャンクは空行で分ける）
export const htmlText = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|h\d|table|ol|ul)>/g, "\n\n")
    .replace(/<\/(li|tr)>/g, "\n")
    .replace(/<\/t[dh]>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
// #endregion

interface Page {
  id: string;
  title: string;
  body?: { storage?: { value: string } };
  _links?: { webui?: string };
}

// #region confluence-docs
// スペースのページを v2 の API で全件取る。1回の応答は最大 100 件で、
// 続きがあると _links.next に次の URL が入る
export async function confluenceDocs(spaceKey: string): Promise<Doc[]> {
  const site = sourcesFromRecords() ? RECORDED_SITE : need("ATL_SITE");
  const headers = sourcesFromRecords() ? {} : atlassianHeaders();
  const sp = await getJson<{ results: { id: string }[] }>(
    `conf-space-${spaceKey}`,
    `${site}/wiki/api/v2/spaces?keys=${spaceKey}`,
    { headers },
    (j) => ({ results: j.results.map(({ id }) => ({ id })) }),
  );
  const docs: Doc[] = [];
  let next: string | undefined =
    `/wiki/api/v2/spaces/${sp.results[0].id}/pages` +
    "?body-format=storage&status=current&limit=100";
  for (let n = 0; next; n++) {
    const res: PageList = await getJson(
      `conf-pages-${spaceKey}-${n}`,
      site + next,
      { headers },
      keepPages,
    );
    for (const p of res.results) docs.push(toDoc(site, p));
    next = res._links?.next;
  }
  return docs;
}
// #endregion

// #region keep-pages
// 記録に残すのは、ページの ID・題名・本文・URL と、続きの URL だけ
type PageList = { results: Page[]; _links?: { next?: string } };
const keepPages = (j: PageList): PageList => ({
  results: j.results.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    _links: { webui: p._links?.webui },
  })),
  _links: { next: j._links?.next },
});
// #endregion

// #region to-doc
function toDoc(site: string, p: Page): Doc {
  const body = htmlText(p.body?.storage?.value ?? "");
  return {
    id: `confluence:${p.id}`,
    source: "confluence",
    url: `${site}/wiki${p._links?.webui ?? `/pages/${p.id}`}`,
    title: p.title,
    body,
    eventDate: eventDateOf(body),
  };
}
// #endregion

// #region auth
function atlassianHeaders(): Record<string, string> {
  const pair = `${need("ATL_EMAIL")}:${need("ATL_TOKEN")}`;
  return {
    Authorization: "Basic " + Buffer.from(pair).toString("base64"),
    Accept: "application/json",
  };
}
// #endregion

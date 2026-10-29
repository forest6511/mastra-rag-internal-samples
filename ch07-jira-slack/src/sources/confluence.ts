import { eventDateOf, type Doc } from "../doc.js";
import { need } from "../env.js";
import { getJson, offline, RECORDED_SITE } from "../record.js";

// #region html-text
// Confluence の本文（storage 形式の HTML）から文字だけを取り出す。
// 段落・見出し・箇条書き・表の行の終わりを改行にして、構造を残す
export const htmlText = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|h\d|li|tr)>/g, "\n")
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
  const site = offline() ? RECORDED_SITE : need("ATL_SITE");
  const headers = offline() ? {} : atlassianHeaders();
  const sp = await getJson<{ results: { id: string }[] }>(
    `conf-space-${spaceKey}`,
    `${site}/wiki/api/v2/spaces?keys=${spaceKey}`,
    { headers },
    (j) => ({ results: j.results.map(({ id }) => ({ id })) }),
  );
  const docs: Doc[] = [];
  let next: string | undefined =
    `/wiki/api/v2/spaces/${sp.results[0].id}/pages` +
    "?body-format=storage&limit=100";
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

import { eventDateOf, type Doc } from "../doc.js";
import { need } from "../env.js";
import { getJson, offline } from "../record.js";

interface Block {
  id: string;
  type: string;
  child_page?: { title: string };
  [type: string]: unknown;
}
interface BlockList {
  results: Block[];
  has_more: boolean;
  next_cursor: string | null;
}

// #region blocks
// ページの中身（ブロック）を全部取る。1回の応答は最大100件で、
// 続きがあれば next_cursor を付けてもう一度呼ぶ
async function blocks(id: string): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | null = null;
  for (let n = 0; n === 0 || cursor; n++) {
    const q = cursor ? `&start_cursor=${cursor}` : "";
    const res: BlockList = await getJson(
      `notion-blocks-${id}-${n}`,
      `https://api.notion.com/v1/blocks/${id}/children?page_size=100${q}`,
      offline() ? {} : { headers: notionHeaders() },
      keepBlocks,
    );
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  }
  return out;
}
// #endregion

// #region keep
// 記録に残すのは、ブロックの ID・種類・文字・子ページの題名だけ
// （編集した人の ID などは残さない）
const keepBlocks = (j: BlockList): BlockList => ({
  has_more: j.has_more,
  next_cursor: j.next_cursor,
  results: j.results.map((b) => ({
    id: b.id,
    type: b.type,
    ...(b.child_page
      ? { child_page: { title: b.child_page.title } }
      : { [b.type]: { rich_text: richTextOf(b) } }),
  })),
});
// #endregion

// #region text
// 段落・見出し・箇条書きは rich_text の配列に文字が入っている
function richTextOf(b: Block): { plain_text: string }[] {
  const body = b[b.type] as { rich_text?: { plain_text: string }[] };
  return (body?.rich_text ?? []).map(({ plain_text }) => ({
    plain_text,
  }));
}

function lineOf(b: Block): string {
  const text = richTextOf(b)
    .map((t) => t.plain_text)
    .join("");
  if (b.type.startsWith("heading")) return `## ${text}`;
  if (b.type === "bulleted_list_item") return `・${text}`;
  return text;
}
// #endregion

// #region notion-docs
// 親ページから子ページをたどり、子ページ1つを資料1件にする。
// 検索の API は作ったばかりのページを十数秒返さないので、
// 一覧は親からたどって作る
export async function notionDocs(rootId: string): Promise<Doc[]> {
  const docs: Doc[] = [];
  const walk = async (pageId: string, title: string) => {
    const lines: string[] = [];
    for (const b of await blocks(pageId)) {
      if (b.child_page) await walk(b.id, b.child_page.title);
      else lines.push(lineOf(b));
    }
    const body = lines.filter(Boolean).join("\n");
    if (pageId !== rootId && body) {
      docs.push({
        id: `notion:${pageId}`,
        source: "notion",
        url: `https://www.notion.so/${pageId.replace(/-/g, "")}`,
        title,
        body,
        eventDate: eventDateOf(body),
      });
    }
  };
  await walk(rootId, "");
  return docs;
}
// #endregion

// #region headers
function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${need("NOTION_TOKEN")}`,
    "Notion-Version": "2022-06-28",
  };
}
// #endregion

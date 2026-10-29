import { header, ofKind, type SeedDoc, type World } from "../corpus.js";
import { need } from "../env.js";
import { request } from "../http.js";
import { saveLoaded } from "../loaded.js";

interface Block {
  type: string;
  text: string;
}

// #region blocks
// Notion のブロック1つ。rich_text の1要素は 2000 字までなので切る
const toBlock = (b: Block) => ({
  object: "block",
  type: b.type,
  [b.type]: {
    rich_text: [
      { type: "text", text: { content: b.text.slice(0, 1900) } },
    ],
  },
});
// #endregion

// #region seed-notion
export async function seedNotion(
  docs: SeedDoc[],
  world: World,
  log: Record<string, string>,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${need("NOTION_TOKEN")}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  const create = (parent: string, title: string, children: Block[]) =>
    request<{ id: string }>("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { page_id: parent },
        properties: {
          title: { title: [{ text: { content: title } }] },
        },
        children: children.map(toBlock),
      }),
    });
  for (const d of ofKind(docs, "notion-page")) {
    if (log[d.plan.id]) continue;
    // 親ページ（「製品」など）は1回だけ作り、記録から使い回す
    const key = `notion-parent:${d.plan.parent}`;
    if (!log[key]) {
      const parentTitle = String(d.plan.parent);
      log[key] = (
        await create(need("NOTION_ROOT_PAGE"), parentTitle, [])
      ).id;
    }
    const blocks = [
      { type: "paragraph", text: header(world, d) },
      ...(d.blocks as Block[]),
    ];
    const page = await create(log[key], String(d.title), blocks);
    log[d.plan.id] = `notion:${page.id}`;
    saveLoaded(log);
  }
}
// #endregion

import { header, ofKind, type SeedDoc, type World } from "../corpus.js";
import { need } from "../env.js";
import { request } from "../http.js";
import { saveLoaded } from "../loaded.js";

// #region auth
// Atlassian の API はメールアドレスと API トークンの Basic 認証
export function atlassianHeaders(): Record<string, string> {
  const pair = `${need("ATL_EMAIL")}:${need("ATL_TOKEN")}`;
  return {
    Authorization: "Basic " + Buffer.from(pair).toString("base64"),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
// #endregion

// #region seed-confluence
export async function seedConfluence(
  docs: SeedDoc[],
  world: World,
  log: Record<string, string>,
): Promise<void> {
  const site = need("ATL_SITE");
  const headers = atlassianHeaders();
  const spaces = await request<{ results: { id: string }[] }>(
    `${site}/wiki/api/v2/spaces?keys=KANADE`,
    { headers },
  );
  const spaceId = spaces.results[0].id;
  for (const d of ofKind(docs, "confluence-page")) {
    if (log[d.plan.id]) continue; // 入れ済み
    const html = `<p>${header(world, d)}</p>${d.body_html}`;
    const page = await request<{ id: string }>(
      `${site}/wiki/api/v2/pages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          spaceId,
          status: "current",
          title: d.title,
          body: { representation: "storage", value: html },
        }),
      },
    );
    log[d.plan.id] = `confluence:${page.id}`;
    saveLoaded(log);
  }
}
// #endregion

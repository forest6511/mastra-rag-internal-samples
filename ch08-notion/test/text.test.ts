import { describe, expect, it } from "vitest";
import { chunk } from "../src/chunk.js";
import { mask } from "../src/record.js";
import { htmlText } from "../src/sources/confluence.js";

describe("Confluence の本文", () => {
  it("段落・箇条書き・表の行で改行し、タグを消す", () => {
    const html =
      "<h2>手順</h2><ol><li>SSH で入る</li><li>deploy.sh</li></ol>" +
      "<table><tr><th>項目</th><td>値</td></tr></table>";
    expect(htmlText(html)).toBe("手順\n\nSSH で入る\ndeploy.sh\n\n項目 値");
  });
});

describe("チャンク分割", () => {
  it("段落の切れ目で分け、どのチャンクも size を大きく超えない", () => {
    const text = Array.from({ length: 12 }, (_, i) =>
      `${i}`.repeat(120),
    ).join("\n\n");
    const pieces = chunk(text, 500);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(500);
    expect(pieces.join("\n")).toBe(text.replace(/\n\n/g, "\n"));
  });

  it("短い文はそのまま1チャンク", () => {
    expect(chunk("デプロイ手順")).toEqual(["デプロイ手順"]);
  });
});

describe("記録の置き換え", () => {
  it("メールアドレスと一時トークンを残さない", () => {
    const s = mask(["a", "example.org"].join("@") + " x?token=ABC123");
    expect(s).toBe("user@example.com x?token=REDACTED");
  });
});

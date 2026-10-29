import { header, nameOf, ofKind } from "../corpus.js";
import type { SeedDoc, World } from "../corpus.js";

interface Comment {
  at: string;
  author: string;
  text: string;
}

// #region cell
// CSV の1セル。" は "" にして、全体を " で囲む
const cell = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
// #endregion

// #region build-jira-csv
// Jira の CSV インポートの形にする。API では作成日を過去にできないため、
// Created と Resolved の列で日付を入れる。コメントは
// 「日時;投稿者のアカウントID;本文」の形（投稿者は自分のアカウントにし、
// 本文の頭に社員名を書く）
export function buildJiraCsv(
  docs: SeedDoc[],
  world: World,
  accountId: string,
): string {
  const rows = ofKind(docs, "jira-issue").map((d) => {
    const p = d.plan;
    const comments = ((d.comments ?? []) as Comment[]).map(
      (c) =>
        `${c.at};${accountId};（${nameOf(world, c.author)}）${c.text}`,
    );
    const labels = ["seed", ...((p.labels as string[]) ?? []), p.id];
    return {
      head: [
        d.summary,
        p.type,
        p.status,
        p.status === "完了" ? "完了" : "",
        `${p.date} 10:00`,
        p.resolved ? `${p.resolved} 18:00` : "",
      ],
      labels,
      description: `${header(world, d)}\n\n${d.description}`,
      comments,
    };
  });
  // #endregion
  // #region build-jira-csv-columns
  // ラベルとコメントは、同じ名前の列を並べて1件ずつ入れる
  const nl = Math.max(...rows.map((r) => r.labels.length));
  const nc = Math.max(1, ...rows.map((r) => r.comments.length));
  const pad = (a: string[], n: number) => [
    ...a,
    ...Array(n - a.length).fill(""),
  ];
  const columns = [
    ...["Summary", "Issue Type", "Status", "Resolution"],
    ...["Created", "Resolved"],
    ...Array(nl).fill("Labels"),
    "Description",
    ...Array(nc).fill("Comment"),
  ];
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) {
    const cells = [
      ...r.head,
      ...pad(r.labels, nl),
      r.description,
      ...pad(r.comments, nc),
    ];
    lines.push(cells.map(cell).join(","));
  }
  return lines.join("\n") + "\n";
}
// #endregion

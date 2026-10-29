// #region doc
// サービスごとに形の違う資料を、この1つの形にそろえる。
// 取り込み・検索・答えは、この形だけを相手にする
export interface Doc {
  id: string; // 例: "confluence:622613"（ソース名を前に付ける）
  source: "confluence" | "github" | "jira" | "slack" | "notion";
  url: string; // 答えの出典として示す元のページ
  title: string;
  body: string; // 本文（HTML などを取り除いた文字）
  eventDate?: string; // 資料の日付（YYYY-MM-DD）。新旧を比べるのに使う
}
// #endregion

// #region event-date
// 資料の日付は、本文の頭の「作成日: 2026-09-01」から取る。
// API の作成日は、資料をサービスに入れた日になってしまうため使わない
export const eventDateOf = (body: string) =>
  body.match(/作成日:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
// #endregion

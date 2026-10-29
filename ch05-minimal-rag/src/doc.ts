// #region doc
// サービスごとに形の違う資料を、この1つの形にそろえる。
// 取り込み・検索・答えは、この形だけを相手にする
export interface Doc {
  id: string; // 例: "confluence:622613"（ソース名を前に付ける）
  source: "confluence" | "github" | "jira" | "slack" | "notion";
  url: string; // 答えの出典として示す元のページ
  title: string;
  body: string; // 本文（HTML などを取り除いた文字）
}
// #endregion

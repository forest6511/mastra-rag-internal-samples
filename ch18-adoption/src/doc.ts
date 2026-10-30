// #region doc
// サービスごとに形の違う資料を、この1つの形にそろえる。
// 取り込み・検索・答えは、この形だけを相手にする
export interface Doc {
  id: string; // 例: "confluence:622613"（ソース名を前に付ける）
  source:
    "confluence" | "github" | "jira" | "slack" | "notion" | "files";
  url: string; // 答えの出典として示す元のページ
  title: string;
  body: string; // 本文（HTML などを取り除いた文字）
  eventDate?: string; // 資料の日付（YYYY-MM-DD）。新旧を比べるのに使う
  canonical?: boolean; // 正本（その話題で正とする資料）か
  // 第10章: 資料の置き場所（例: "slack:incident"）と、見てよいグループ
  container?: string;
  acl?: string[];
}
// #endregion

// #region event-date
// 本書の環境では、資料の日付を本文の頭の
// 「作成日: 2026-09-01」から取る。
// カナデループの資料は API で過去の日付を入れられず、API の作成日が
// 資料を入れた日になるため。自社の資料では API の更新日を使う
// （第18章の files の取り込みは、資料の date か、ファイルの更新日）
export const eventDateOf = (body: string) =>
  body.match(/作成日:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
// #endregion

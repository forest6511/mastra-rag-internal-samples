import { groupsOf } from "./acl.js";
import { asUser, pool } from "./db.js";
import { keywordSearch, queryTerms } from "./hybrid.js";

// #region main
// npm run terms -- "質問" --as kobayashi
// 全文検索に使う語と、当たったチャンクの数を、2つの区切り方で比べる
const args = process.argv.slice(2);
const user = args[args.indexOf("--as") + 1] ?? "";
const q = args.find((a, i) => a !== "--as" && args[i - 1] !== "--as");
const ways = {
  句読点で区切る: (q ?? "").split(/[、。？！\s]+/).filter(Boolean),
  漢字カタカナ英数字の続き: queryTerms(q ?? ""),
};
for (const [name, terms] of Object.entries(ways)) {
  const hits = await asUser(groupsOf(user), (c) =>
    keywordSearch(c, terms),
  );
  console.log(`${name}: ${JSON.stringify(terms)} → ${hits.length} 件`);
}
await pool.end();
// #endregion

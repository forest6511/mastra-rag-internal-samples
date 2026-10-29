import { allDocs } from "./build.js";

// npm run show-doc -- "jira:KAN-13"
// 答えの出典の資料を、記録から開いて全文を見る（アカウント不要）
const id = process.argv[2];
const docs = await allDocs();
const d = docs.find((x) => x.id === id);
if (!d) {
  console.log("資料の id を指定します。例:");
  for (const x of docs) console.log(`  ${x.id}  ${x.title}`);
  process.exit(1);
}
console.log(`${d.title}\n${d.url}\n日付: ${d.eventDate ?? "なし"}\n`);
console.log(d.body);

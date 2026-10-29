import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCorpus, loadWorld } from "./corpus.js";
import { readLoaded } from "./loaded.js";
import { seedConfluence } from "./seed/confluence.js";
import { seedGitHub } from "./seed/github.js";
import { buildJiraCsv } from "./seed/jira-csv.js";
import { atlassianHeaders } from "./seed/confluence.js";
import { buildSlackExport } from "./seed/slack-export.js";
import { seedNotion } from "./seed/notion.js";
import { joinSlackChannels } from "./seed/slack-join.js";
import { need } from "./env.js";
import { request } from "./http.js";

// #region jira-csv-file
// CSV を seed/out/jira.csv に書く。取り込みは Jira の画面で行う
async function writeJiraCsv(docs = loadCorpus(), world = loadWorld()) {
  const me = await request<{ accountId: string }>(
    `${need("ATL_SITE")}/rest/api/3/myself`,
    { headers: atlassianHeaders() },
  );
  fs.mkdirSync("seed/out", { recursive: true });
  fs.writeFileSync(
    "seed/out/jira.csv",
    buildJiraCsv(docs, world, me.accountId),
  );
  console.log("seed/out/jira.csv を書きました");
}
// #endregion

// #region slack-zip-file
// エクスポート形式を一時フォルダに書き、ZIP にまとめる
// （zip コマンドを使う）
function writeSlackZip(docs = loadCorpus(), world = loadWorld()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-"));
  for (const [file, json] of buildSlackExport(docs, world)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, file),
      JSON.stringify(json, null, 1),
    );
  }
  const zip = path.resolve("seed/out/slack-export.zip");
  fs.mkdirSync("seed/out", { recursive: true });
  fs.rmSync(zip, { force: true });
  execFileSync("zip", ["-qr", zip, "."], { cwd: dir });
  console.log(`${zip} を書きました`);
}
// #endregion

// #region main
const steps: Record<string, () => unknown> = {
  confluence: () =>
    seedConfluence(loadCorpus(), loadWorld(), readLoaded()),
  notion: () => seedNotion(loadCorpus(), loadWorld(), readLoaded()),
  github: () => seedGitHub(loadCorpus(), loadWorld(), readLoaded()),
  "jira-csv": () => writeJiraCsv(),
  "slack-zip": () => writeSlackZip(),
  "slack-join": () => joinSlackChannels(loadCorpus()),
};
const step = steps[process.argv[2] ?? ""];
if (!step) {
  console.log(
    `使い方: npm run seed -- ${Object.keys(steps).join(" | ")}`,
  );
  process.exit(1);
}
await step();
// #endregion

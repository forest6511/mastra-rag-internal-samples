import { execFileSync } from "node:child_process";
import { header, nameOf, ofKind } from "../corpus.js";
import type { SeedDoc, World } from "../corpus.js";
import { need } from "../env.js";
import { saveLoaded } from "../loaded.js";

// #region gh
// GitHub CLI（gh）で操作する。gh auth login 済みのアカウントで書き込む
const gh = (args: string[]) =>
  execFileSync("gh", args, { encoding: "utf8" }).trim();

// コミットの作者は架空の「Kanade Dev」にする（自分の名前を残さない）
const AUTHOR = [
  ...["-f", "committer[name]=Kanade Dev"],
  ...["-f", "committer[email]=dev@example.com"],
];

// #endregion
// #region put-file
function putFile(
  repo: string,
  file: string,
  text: string,
  branch = "",
) {
  const ref = branch ? `?ref=${branch}` : "";
  let sha = "";
  try {
    sha = JSON.parse(
      gh(["api", `repos/${repo}/contents/${file}${ref}`]),
    ).sha;
  } catch {
    // まだ無いファイル
  }
  gh([
    ...["api", "-X", "PUT", `repos/${repo}/contents/${file}`],
    ...["-f", `message=Update ${file}`],
    ...["-f", `content=${Buffer.from(text).toString("base64")}`],
    ...(branch ? ["-f", `branch=${branch}`] : []),
    ...(sha ? ["-f", `sha=${sha}`] : []),
    ...AUTHOR,
  ]);
}
// #endregion

// #region seed-github
export function seedGitHub(
  docs: SeedDoc[],
  world: World,
  log: Record<string, string>,
): void {
  const org = need("GH_ORG");
  for (const d of ofKind(docs, "github-readme")) {
    if (log[d.plan.id]) continue;
    const repo = `${org}/${d.plan.repo}`;
    try {
      gh(["repo", "view", repo]);
    } catch {
      gh(["repo", "create", repo, "--private"]);
    }
    putFile(repo, "README.md", String(d.body));
    log[d.plan.id] = `github:${d.plan.repo}:README`;
    saveLoaded(log);
  }
  // #endregion
  // #region seed-github-pr
  for (const d of ofKind(docs, "github-pr")) {
    if (log[d.plan.id]) continue;
    const repo = `${org}/${d.plan.repo}`;
    const branch = `seed/${d.plan.id}`;
    const main = JSON.parse(
      gh(["api", `repos/${repo}/git/ref/heads/main`]),
    ).object.sha;
    try {
      gh([
        ...["api", "-X", "POST", `repos/${repo}/git/refs`],
        ...["-f", `ref=refs/heads/${branch}`, "-f", `sha=${main}`],
      ]);
    } catch {
      // 前回の途中で作ったブランチが残っている
    }
    putFile(repo, `changes/${d.plan.id}.md`, `${d.title}\n`, branch);
    // #endregion
    // #region seed-github-pr-create
    const body = `${header(world, d)}\n\n${d.body}`;
    const url = gh([
      ...["pr", "create", "-R", repo, "-B", "main", "-H", branch],
      ...["-t", String(d.title), "-b", body],
    ]);
    const num = url.split("/").pop() ?? "";
    for (const c of (d.comments ?? []) as Record<string, string>[]) {
      const text = `（${nameOf(world, c.author)}・${c.at}）${c.text}`;
      gh(["pr", "comment", num, "-R", repo, "-b", text]);
    }
    if (d.plan.merged) gh(["pr", "merge", num, "-R", repo, "--squash"]);
    log[d.plan.id] = `github:${d.plan.repo}:${num}`;
    saveLoaded(log);
  }
}
// #endregion

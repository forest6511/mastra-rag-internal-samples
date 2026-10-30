import crypto from "node:crypto";
import fs from "node:fs";
import { Agent } from "@mastra/core/agent";
import YAML from "yaml";
import { z } from "zod";
import { MODEL } from "./agent.js";
import { offline, recording } from "./record.js";
import type { Hit } from "./search.js";

interface Event {
  date?: string;
  label: string;
}
const table = () =>
  YAML.parse(fs.readFileSync("events.yml", "utf8")) as {
    events: Record<string, Event>;
    docs: Record<string, string>;
  };

// #region events-of
// 材料の資料が属する出来事を、重ならないように集める。
// 出来事ごとに、材料の中で最初に出てきた資料の題名を添える
export function eventsOf(hits: Hit[]) {
  const { events, docs } = table();
  const found = new Map<
    string,
    Event & { id: string; title: string }
  >();
  for (const h of hits) {
    const id = docs[h.docId];
    if (!id || found.has(id)) continue;
    found.set(id, { id, ...events[id], title: h.title });
  }
  return [...found.values()];
}
// #endregion

// #region event-names
// 資料の ID → 「日付 出来事の名前」。答えの材料に添える（第13章）
export function eventNames(): Map<string, string> {
  const { events, docs } = table();
  return new Map(
    Object.entries(docs).map(([doc, id]) => {
      const e = events[id];
      return [doc, `${e.date ? e.date + " " : ""}${e.label}`];
    }),
  );
}
// #endregion

// #region ask-back
// 聞き返す答え。候補の出来事を、日付と資料の題名つきで並べる
export function askBack(
  candidates: { date?: string; label: string; title: string }[],
) {
  const lines = candidates.map(
    (c) =>
      `- ${c.date ? c.date + " " : ""}${c.label}（資料: ${c.title}）`,
  );
  return [
    `確認させてください。質問に当てはまるものが${candidates.length}つあります。`,
    ...lines,
    "どれのことか、日付か名前を添えて、もう一度聞いてください。",
  ].join("\n");
}
// #endregion

// #region clarify
// 答える前の段: 質問が聞いている物事に、同じ種類の別々の出来事が
// 2つ以上当てはまり、質問の言葉で1つに絞れないときだけ、聞き返す。
// 1回目の版は「あいまいか」を1つの真偽で聞いたので、答えるべき質問
// でも聞き返した。判断を3つに分けて答えさせ、最後はコードで決める
const RULES = [
  "社内の質問が、どの出来事について聞いているかを判断します。",
  "- kind: 質問が聞いている物事の種類（障害・API・方針など）",
  "- same_kind: 候補のうち、kind に当たる別々の出来事の id。" +
    "同じ話の決定と実施のように、1つの流れの段階は別々に数えない",
  "- narrowed: 質問の日付・月・名前・内容で、same_kind の" +
    "1つに絞れるなら true",
  "- comparing: 質問が複数の出来事の関係や比較を聞いているなら true",
].join("\n");
const judgeTarget = new Agent({
  id: "kanade-clarify",
  name: "出来事の確認",
  instructions: RULES,
  model: MODEL,
});
const Target = z.object({
  kind: z.string(),
  same_kind: z.array(z.string()),
  narrowed: z.boolean(),
  comparing: z.boolean(),
});
// #endregion

// #region clarify-call
export async function clarify(question: string, hits: Hit[], rep = 1) {
  const found = eventsOf(hits);
  if (found.length < 2) return null; // 候補が1つ以下なら決めつけようがない
  const list = found
    .map(
      (e) =>
        `${e.id}: ${e.date ?? "日付なし"} ${e.label}（${e.title}）`,
    )
    .join("\n");
  const prompt = `質問: ${question}\n\n候補の出来事:\n${list}`;
  const t = await cached(
    RULES + prompt + (rep > 1 ? `#${rep}` : ""),
    async () => {
      const res = await judgeTarget.generate(prompt, {
        structuredOutput: { schema: Target },
      });
      return res.object;
    },
  );
  const picked = found.filter((e) => t.same_kind.includes(e.id));
  const ask = picked.length >= 2 && !t.narrowed && !t.comparing;
  return ask ? askBack(picked) : null;
}
// #endregion

// 判断の結果も records/clarify.jsonl に記録し、OFFLINE=1 では
// 記録から返す
const FILE = "records/clarify.jsonl";
type T = z.infer<typeof Target>;
async function cached(prompt: string, run: () => Promise<T>) {
  const key = crypto
    .createHash("sha256")
    .update(MODEL + prompt)
    .digest("hex");
  const lines = fs.existsSync(FILE)
    ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean)
    : [];
  const saved = lines
    .map((l) => JSON.parse(l) as { k: string; t: T })
    .find((r) => r.k === key);
  if (saved) return saved.t;
  if (offline()) throw new Error("OFFLINE: この判断は記録に無い");
  const t = await run();
  if (recording()) {
    fs.appendFileSync(FILE, JSON.stringify({ k: key, t }) + "\n");
  }
  return t;
}

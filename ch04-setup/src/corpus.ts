import fs from "node:fs";
import YAML from "yaml";

// #region types
// seed/corpus/*.json の1件。plan は「どの出来事から作った資料か」の記録
export interface Plan {
  id: string;
  kind: string;
  author: string;
  date: string;
  event: string;
  [key: string]: unknown;
}

export interface SeedDoc {
  plan: Plan;
  title?: string;
  [key: string]: unknown;
}

export interface Person {
  id: string;
  name: string;
}

export interface World {
  people: Person[];
  timeline: { id: string; date: string; title: string }[];
}
// #endregion

// #region load
export function loadWorld(dir = "seed"): World {
  return YAML.parse(fs.readFileSync(`${dir}/world.yml`, "utf8"));
}

export function loadCorpus(dir = "seed"): SeedDoc[] {
  return fs
    .readdirSync(`${dir}/corpus`)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) =>
      JSON.parse(fs.readFileSync(`${dir}/corpus/${f}`, "utf8")),
    );
}

// 資料の種類（confluence-page・slack-thread など）で絞る
export const ofKind = (docs: SeedDoc[], kind: string) =>
  docs.filter((d) => d.plan.kind === kind);

// 人物の id（tanaka）を名前（田中 誠）にする
export const nameOf = (world: World, id: string) =>
  world.people.find((p) => p.id === id)?.name ?? id;

// API で過去の日付を入れられないサービスでは、本文の頭に書く
export const header = (world: World, d: SeedDoc) =>
  `作成日: ${d.plan.date} ／ 作成者: ${nameOf(world, d.plan.author)}`;
// #endregion

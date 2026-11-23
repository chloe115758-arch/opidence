// 리포트 내보내기: 저장된 묶음·요약·근거만 모아 Markdown 글로 만든다. AI를 새로 부르지 않고, DB를 바꾸지 않는다.
// 브라우저에서 내보내기를 누를 때 부른다(그래서 "만든 날"이 누른 날이다). 인용은 DB의 원문이고, 묶음 제목과 요약만 AI가 쓴 글이다.
import type { Checked } from "./evidence";

export type ReportInsight = { title: string; summary: string; evidence: Checked[] };

const QUOTES = 3; // 묶음마다 보여 줄 인용 수(최대)

// 한국은 서머타임이 없어 +9시간 고정(lib/store.ts와 같은 방식). 예: "2026. 11. 26"
const day = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ". ");

// AI가 쓴 글과 원문에 든 Markdown 기호가 리포트 모양을 깨지 않게 막는다. 줄바꿈은 한 칸으로 합친다(저장된 발언에는 원래 줄바꿈이 없다).
const esc = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}[\]<>#|~])/g, "\\$1")
    .replace(/^(\d+)\./, "$1\\.")
    .replace(/^([-+!])/, "\\$1");

type Cited = Extract<Checked, { status: "verified" }>;

// 대표 인용: 서로 다른 참가자의 발언을 먼저(근거 순서대로 참가자마다 첫 발언), 모자라면 남은 근거를 순서대로 채운다. 보여 줄 때는 근거 순서로 돌려놓는다.
// 코드는 뜻을 가릴 수 없어서 "대표"는 이 규칙으로 고른 것일 뿐이다.
function pickQuotes(cited: Cited[]): Cited[] {
  const chosen = new Set<Cited>();
  const seen = new Set<string>();
  for (const c of cited) {
    if (chosen.size >= QUOTES) break;
    if (!seen.has(c.utterance.label)) {
      seen.add(c.utterance.label);
      chosen.add(c);
    }
  }
  for (const c of cited) if (chosen.size < QUOTES) chosen.add(c);
  return cited.filter((c) => chosen.has(c));
}

// 묶음이 하나도 없으면 빈 문자열을 돌려준다(화면은 이때 내보내기를 보여 주지 않는다).
export function buildReport({
  insights,
  transcriptCount,
  analyzedAt,
  now,
}: {
  insights: ReportInsight[];
  transcriptCount: number;
  analyzedAt: string | null; // 가장 최근에 성공한 분석의 시각(ISO). 모르면 null
  now: Date;
}): string {
  if (insights.length === 0) return "";
  const withQuotes: { insight: ReportInsight; cited: Cited[] }[] = [];
  const without: ReportInsight[] = [];
  for (const insight of insights) {
    const seen = new Set<string>(); // 같은 발언이 두 번 연결돼 있어도 한 번만 센다
    const cited = insight.evidence.filter((e): e is Cited => e.status === "verified" && !seen.has(e.utterance.id) && !!seen.add(e.utterance.id));
    if (cited.length > 0) withQuotes.push({ insight, cited });
    else without.push(insight);
  }

  const head = [`만든 날 ${day(now)}`, `지금 올라 있는 전사본 ${transcriptCount}건`, ...(analyzedAt ? [`분석한 날 ${day(new Date(analyzedAt))}`] : [])];
  const out: string[] = ["# Opidence 리포트", head.join(" · ")];

  withQuotes.forEach(({ insight, cited }, i) => {
    const labels = [...new Set(cited.map((c) => c.utterance.label))].sort();
    out.push(`## ${i + 1}. ${esc(insight.title)}`, esc(insight.summary), `참가자 ${labels.length}명의 발언을 근거로 달았어요 (${labels.join(", ")})`);
    for (const c of pickQuotes(cited)) out.push(`> “${esc(c.utterance.text)}” — 참가자 ${c.utterance.label} · ${c.utterance.id}`);
  });

  if (without.length > 0) {
    out.push(`## 근거를 찾지 못한 묶음 (${without.length}개)`);
    for (const insight of without) out.push(`### ${esc(insight.title)}`, esc(insight.summary), "원문에서 근거를 찾지 못했어요.");
  }

  out.push("---", "인용은 원문 그대로예요. 묶음 제목과 요약은 AI가 만들었어요.", "근거가 묶음의 뜻과 맞는지는 직접 확인해 주세요.");
  return out.join("\n\n") + "\n";
}

// 내려받을 파일 이름. 예: opidence-리포트-2026-11-26.md
export const reportFileName = (now: Date) => `opidence-리포트-${day(now).replace(/\. /g, "-")}.md`;

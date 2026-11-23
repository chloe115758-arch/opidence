import type { Transcript } from "../types";

// MOCK_AI=1일 때 OpenAI 대신 돌려주는 가짜 응답. "근거 없음" 경로(없는 ID, 진행자 ID, 변형 ID, ID 없음)를 일부러 만든다.
// ID는 사용자의 전사본에서 골라서, 어떤 전사본이든 같은 구성으로 나온다.
export function mockClusters(transcripts: Transcript[]) {
  const all = transcripts.flatMap((t) => t.utterances);
  const people = all.filter((u) => u.role === "participant").map((u) => u.id);
  const mod = all.find((u) => u.role === "moderator")?.id;
  const [a, b, c, d] = people;
  const ids = (...list: (string | undefined)[]) => list.filter((x): x is string => !!x);

  return {
    output: {
      clusters: [
        { title: "① 정상: 모두 원문과 일치", summary: "참가자 발언 ID만 담은 묶음", utterance_ids: ids(a, b, c) },
        { title: "② 섞임: 정상 1 · 없는 ID 1 · 진행자 ID 1", summary: "일부만 근거로 인정돼야 한다", utterance_ids: ids(d, "Z-99", mod) },
        { title: "③ 전부 탈락", summary: "근거가 하나도 인정되지 않아야 한다", utterance_ids: ids("Z-98", mod) },
        // 실제 ID를 소문자·앞 공백으로 바꾼 것. 고쳐 주지 않고 not_found여야 한다.
        { title: "④ 변형 ID", summary: "비슷한 ID를 고쳐 주지 않는다", utterance_ids: ids(a?.toLowerCase(), b && ` ${b}`) },
        { title: "⑤ ID 없음", summary: "AI가 발언 ID를 붙이지 않은 경우", utterance_ids: [] },
        { title: "⑥ 중복 ID", summary: "같은 ID가 두 번 오면 하나로 합친다", utterance_ids: ids(a, a) },
      ],
    },
    inputTokens: null,
    outputTokens: null,
  };
}

// MOCK_AI=1일 때 OpenAI 대신 쓰는 가짜 임베딩. 글이 같으면 벡터가 같고 글이 다르면 벡터가 다르다. 뜻은 담지 않는다(찾은 순서가 의미 없다).
// 차원 1536은 db의 vector(1536)과 같아야 한다.
export function mockEmbedding(text: string): number[] {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return Array.from({ length: 1536 }, () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 2 ** 31 - 1;
  });
}

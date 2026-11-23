import type { Transcript, Utterance } from "../types";

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
        { title: "① 정상: 모두 원문과 일치", summary: "참가자 발언 번호만 담은 묶음", utterance_ids: ids(a, b, c) },
        { title: "② 섞임: 정상 1 · 없는 번호 1 · 진행자 번호 1", summary: "일부만 근거로 인정돼야 한다", utterance_ids: ids(d, "Z-99", mod) },
        { title: "③ 전부 탈락", summary: "근거가 하나도 인정되지 않아야 한다", utterance_ids: ids("Z-98", mod) },
        // 실제 ID를 소문자·앞 공백으로 바꾼 것. 고쳐 주지 않고 not_found여야 한다.
        { title: "④ 변형 번호", summary: "비슷한 번호를 고쳐 주지 않는다", utterance_ids: ids(a?.toLowerCase(), b && ` ${b}`) },
        { title: "⑤ 번호 없음", summary: "AI가 발언 번호를 붙이지 않은 경우", utterance_ids: [] },
        { title: "⑥ 중복 번호", summary: "같은 번호가 두 번 오면 하나로 합친다", utterance_ids: ids(a, a) },
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

// MOCK_AI=1일 때 검색 · 찾기가 OpenAI 대신 돌려주는 가짜 응답. 사용성 테스트 재료다(docs/plan.md "의도적 오류 데이터").
// 샘플 8건이 올라와 있으면 아래 세 문장을 그대로 돌려준다. 아니면 사용자의 전사본에서 번호를 골라 같은 구성으로 만든다.
// shortcut: 샘플 여부는 라벨 A~H와 다섯 발언의 화자만 본다. 같은 번호·화자를 가진 다른 전사본이면 잘못 알아본다(개발 전용이라 둔다).
export function mockAnswer(all: Utterance[]) {
  const byId = new Map(all.map((u) => [u.id, u]));
  const labels = new Set(all.map((u) => u.id.split("-")[0]));
  const isSample =
    [..."ABCDEFGH"].every((l) => labels.has(l)) &&
    ["A-08", "H-08", "C-08", "C-10"].every((id) => byId.get(id)?.role === "participant") &&
    byId.get("A-07")?.role === "moderator";

  const sentences = isSample
    ? [
        // C-08은 실제 참가자 발언이지만 뜻이 반대다("반납은 쉬워요… 불만 없어요"). 사람이 읽어야 알 수 있는 오류.
        { text: "반납이 제대로 됐는지 확신하기 어렵다는 말이 여러 번 나왔습니다.", utterance_ids: ["A-08", "H-08", "C-08"] },
        // A-07은 진행자 발언, Z-99는 없는 번호. 코드가 걸러 낸다.
        { text: "반납이 처리되지 않아 추가 요금이 나온 경우도 있었습니다.", utterance_ids: ["C-10", "A-07", "Z-99"] },
        // 근거가 없는 문장. 기본으로 숨겨져야 한다.
        { text: "대부분의 참가자가 앱 사용을 그만두었습니다.", utterance_ids: [] },
      ]
    : (() => {
        const people = all.filter((u) => u.role === "participant").map((u) => u.id);
        const mod = all.find((u) => u.role === "moderator")?.id;
        return [
          { text: "(가짜 응답) 참가자 발언만 근거로 단 문장입니다.", utterance_ids: people.slice(0, 3) },
          { text: "(가짜 응답) 정상 1개, 진행자 번호 1개, 없는 번호 1개를 단 문장입니다.", utterance_ids: [people[3], mod, "Z-99"].filter((x): x is string => !!x) },
          { text: "(가짜 응답) 근거가 없는 문장입니다.", utterance_ids: [] },
        ];
      })();
  return { output: { sentences }, inputTokens: null, outputTokens: null };
}

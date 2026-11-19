// 화면 뼈대용 가짜 데이터. 전사본 화면은 DB로 바꿨고, 주제 묶음·질문 화면이 아직 쓴다. 5단계까지 연결하면 이 파일을 지운다.
// 실제 인터뷰(공공자전거)와 다른 주제로 만들었다: 실제 묶음 예시를 미리 보면 기준선 측정이 흐려진다.
import { checkEvidence } from "./evidence";
import type { AnswerSentence, Insight, Transcript, Utterance } from "./types";

// 홀수 줄은 진행자, 짝수 줄은 참가자
function lines(label: string, texts: string[]): Utterance[] {
  return texts.map((text, i) => ({
    id: `${label}-${String(i + 1).padStart(2, "0")}`,
    label,
    seq: i + 1,
    role: i % 2 === 0 ? "moderator" : "participant",
    text,
  }));
}

export const transcripts: Transcript[] = [
  {
    label: "X",
    meta: "가짜 데이터 | 시험 기간에 매일 이용",
    utterances: lines("X", [
      "도서관 좌석 예약 앱을 언제 쓰세요?",
      "시험 기간에 거의 매일 써요. 아침에 자리 잡으려고요.",
      "불편했던 적이 있나요?",
      "예약한 자리에 가 보니 다른 사람이 앉아 있었어요. 앱에는 제 자리라고 나오는데요.",
      "그때 어떻게 하셨어요?",
      "말하기 민망해서 그냥 다른 자리를 다시 예약했어요.",
      "좋았던 점은요?",
      "집에서 빈자리를 미리 볼 수 있는 건 편해요.",
    ]),
  },
  {
    label: "Y",
    meta: "가짜 데이터 | 주 2회 이용",
    utterances: lines("Y", [
      "앱을 얼마나 자주 쓰세요?",
      "일주일에 두 번쯤이요. 과제 있을 때만요.",
      "예약할 때 어떠셨어요?",
      "연장 버튼을 못 찾아서 자리가 풀린 적이 있어요. 알림도 안 왔고요.",
      "자리가 풀렸다고요?",
      "네, 화장실 다녀온 사이에 다른 사람이 예약해 버렸어요.",
      "바라는 점이 있나요?",
      "시간이 끝나기 10분 전에 알려 주면 좋겠어요.",
    ]),
  },
];

const allUtterances = transcripts.flatMap((t) => t.utterances);
export const check = (id: string) => checkEvidence(id, allUtterances);

// Y-05는 진행자 발언, Z-99는 없는 ID: "근거 없음" 상태를 보려고 일부러 넣었다.
export const insights: Insight[] = [
  {
    id: "1",
    title: "예약한 자리를 실제로 쓰지 못하는 경우가 있다",
    summary: "예약이 되어 있어도 다른 사람이 앉아 있거나, 자리를 비운 사이 예약이 넘어간다.",
    evidenceIds: ["X-04", "Y-06"],
  },
  {
    id: "2",
    title: "연장 방법과 종료 알림이 눈에 띄지 않는다",
    summary: "연장 버튼을 찾지 못했고, 시간이 끝나기 전에 알려 주기를 바란다.",
    evidenceIds: ["Y-04", "Y-08", "Y-05"],
  },
  {
    id: "3",
    title: "좌석 추천 기능을 원한다",
    summary: "AI가 만든 묶음이지만 가리킨 발언이 원문에 없다.",
    evidenceIds: ["Z-99"],
  },
];

export function mockAnswer(question: string): AnswerSentence[] {
  if (question.includes("식당")) return [];
  // 긴 답변 예시: 휴대폰 화면에서 문장과 원문 카드가 얼마나 멀어지는지 보려고 둔다
  if (question.includes("정리"))
    return [
      { text: "시험 기간에는 아침에 자리를 잡으려고 거의 매일 앱을 씁니다.", evidenceIds: ["X-02"] },
      { text: "과제가 있을 때만 일주일에 두 번쯤 쓰는 경우도 있습니다.", evidenceIds: ["Y-02"] },
      { text: "예약한 자리에 가 보니 다른 사람이 앉아 있던 경험이 있습니다.", evidenceIds: ["X-04"] },
      { text: "그때는 말하기 민망해서 다른 자리를 다시 예약했습니다.", evidenceIds: ["X-06"] },
      { text: "연장 버튼을 찾지 못해 자리가 풀렸고 알림도 오지 않았습니다.", evidenceIds: ["Y-04"] },
      { text: "시간이 끝나기 10분 전에 알려 주기를 바랍니다.", evidenceIds: ["Y-08"] },
    ];
  return [
    { text: "예약한 자리에 다른 사람이 앉아 있던 경험이 있습니다.", evidenceIds: ["X-04"] },
    // Y-06(자리를 비운 사이 예약이 넘어감)은 이 문장을 뒷받침하지 않는다. 고치지 않는다: 사용성 테스트에서 잘못된 근거를 찾아내는지 보는 재료다(docs/plan.md).
    { text: "연장 버튼을 찾지 못해 자리가 풀린 경우도 있습니다.", evidenceIds: ["Y-04", "Y-06"] },
    { text: "대부분의 참가자가 앱을 삭제했습니다.", evidenceIds: ["Z-99"] },
    { text: "자리가 풀린 것이 가장 큰 문제로 꼽혔습니다.", evidenceIds: ["Y-05"] },
  ];
}

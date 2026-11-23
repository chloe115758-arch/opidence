// 화자 확인: 역할을 알 수 없는 전사본("참석자 1", 이름 등)에서 화자마다 진행자·참가자를 고르는 규칙.
// 순수 함수만 둔다(화면, 서버, 테스트가 함께 쓴다). 나중에 "텍스트 붙여넣기" 미리보기도 같은 규칙을 쓴다.
import type { Problem } from "./transcript";

export type Role = "moderator" | "participant";

// 화자 한 명. key는 표기를 소문자·공백 없이 만든 값이고 roles의 열쇠다. known은 표기에서 역할을 알 수 있을 때(진행자, 참가자 …)의 역할이다.
// first는 첫 발언(미리보기용, 길면 잘라 둔다).
export type SpeakerInfo = { key: string; token: string; count: number; first: string; known: Role | null };

export type Roles = Record<string, Role>;

export const FEW = 2; // 발언이 이 수 이하인 화자는 인식 오류일 수 있다고 알린다
export const FGI_MIN = 3; // 발언이 이 수 이상인 참가자가 둘 이상이면 여러 명 인터뷰로 보고 막는다
const PREVIEW = 80;

export const isFew = (s: SpeakerInfo) => s.count <= FEW;
export const preview = (text: string) => {
  const chars = [...text];
  return chars.length > PREVIEW ? `${chars.slice(0, PREVIEW).join("")}…` : text;
};

// 미리 골라 둘 역할. 표기에서 알 수 있으면 그대로, 모르는 표기는 처음 말한 화자를 진행자로, 나머지를 참가자로 한다.
// 1~2줄뿐인 화자는 진행자 후보에서 뺀다(인식 오류일 수 있다). 모두 1~2줄이면 처음 말한 화자가 후보다. 화자가 한 명이면 참가자다.
export function defaultRoles(speakers: SpeakerInfo[]): Roles {
  const roles: Roles = {};
  const knownModerator = speakers.some((s) => s.known === "moderator");
  const unknown = speakers.filter((s) => s.known === null);
  const candidate =
    knownModerator || speakers.length < 2 ? undefined : (unknown.find((s) => !isFew(s)) ?? unknown[0]);
  for (const s of speakers) roles[s.key] = s.known ?? (s === candidate ? "moderator" : "participant");
  return roles;
}

// 고른 역할이 규칙에 맞는지. 어긋나면 화면은 저장 버튼을 막고 서버는 저장하지 않는다.
export function checkRoles(speakers: SpeakerInfo[], roles: Roles): Problem[] {
  if (speakers.some((s) => roles[s.key] !== "moderator" && roles[s.key] !== "participant"))
    return [{ message: "화자마다 진행자나 참가자를 골라 주세요." }];
  const participants = speakers.filter((s) => roles[s.key] === "participant");
  if (participants.length === 0) return [{ message: "참가자를 한 명 이상 골라 주세요." }];
  const many = participants.filter((s) => s.count >= FGI_MIN);
  if (many.length >= 2)
    return [
      {
        message: `지금은 1:1 인터뷰만 올릴 수 있어요. 발언이 ${FGI_MIN}개 이상인 참가자가 ${many.length}명이에요(${many.map((s) => s.token).join(", ")}). 한 명만 참가자로 남겨 주세요.`,
      },
    ];
  return [];
}

// 화면의 요약 줄 재료. 진행자로 고른 발언 수는 근거로 쓰지 않는다는 것을 보여 주는 데 쓴다.
export function summarizeRoles(speakers: SpeakerInfo[], roles: Roles) {
  const by = (role: Role) => speakers.filter((s) => roles[s.key] === role);
  const sum = (list: SpeakerInfo[]) => list.reduce((n, s) => n + s.count, 0);
  const moderators = by("moderator");
  const participants = by("participant");
  return {
    moderators: moderators.length,
    participants: participants.length,
    moderatorUtterances: sum(moderators),
    participantUtterances: sum(participants),
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { checkRoles, defaultRoles, summarizeRoles } from "./speakers.ts";

const sp = (token, count, known = null) => ({ key: token.toLowerCase().replace(/\s+/g, ""), token, count, first: "", known });
const roles = (list, ...r) => Object.fromEntries(list.map((s, i) => [s.key, r[i]]));

test("기본 역할: 모르는 표기는 처음 말한 화자가 진행자, 나머지는 참가자", () => {
  const l = [sp("참석자 1", 5), sp("참석자 2", 5), sp("참석자 3", 4)];
  assert.deepEqual(Object.values(defaultRoles(l)), ["moderator", "participant", "participant"]);
});

test("기본 역할: 1~2줄 화자는 진행자 후보에서 빼고, 모두 1~2줄이면 처음 말한 화자가 후보다", () => {
  const a = [sp("참석자 3", 1), sp("참석자 1", 5), sp("참석자 2", 5)];
  assert.deepEqual(Object.values(defaultRoles(a)), ["participant", "moderator", "participant"]);
  const b = [sp("김테스트", 2), sp("이테스트", 2)];
  assert.deepEqual(Object.values(defaultRoles(b)), ["moderator", "participant"]);
});

test("기본 역할: 표기가 알려 주는 역할은 그대로, 진행자 표기가 있으면 모르는 표기는 모두 참가자, 한 명이면 참가자", () => {
  const l = [sp("진행자", 2, "moderator"), sp("참가자", 1, "participant"), sp("김테스트", 1)];
  assert.deepEqual(Object.values(defaultRoles(l)), ["moderator", "participant", "participant"]);
  assert.deepEqual(Object.values(defaultRoles([sp("참석자 1", 9)])), ["participant"]);
});

test("역할 검사: 빠진 화자, 참가자 없음, 3개 이상 발언의 참가자 둘 이상은 막는다", () => {
  const l = [sp("참석자 1", 5), sp("참석자 2", 5), sp("참석자 3", 1)];
  assert.match(checkRoles(l, { 참석자1: "moderator" })[0].message, /화자마다/);
  assert.match(checkRoles(l, roles(l, "moderator", "moderator", "moderator"))[0].message, /참가자를 한 명 이상/);
  assert.match(checkRoles(l, roles(l, "participant", "participant", "moderator"))[0].message, /1:1 인터뷰만 올릴 수 있어요.*참석자 1, 참석자 2/);
  assert.deepEqual(checkRoles(l, roles(l, "moderator", "participant", "participant")), []);
  // 발언이 2개뿐인 화자는 여러 명 인터뷰로 세지 않는다. 진행자는 몇 명이어도 된다.
  const m = [sp("가", 5), sp("나", 2), sp("다", 4), sp("라", 4)];
  assert.deepEqual(checkRoles(m, roles(m, "participant", "participant", "moderator", "moderator")), []);
});

test("요약: 진행자로 고른 발언 수(근거로 쓰지 않는 발언)를 센다", () => {
  const l = [sp("참석자 1", 5), sp("참석자 2", 6), sp("참석자 3", 1)];
  assert.deepEqual(summarizeRoles(l, roles(l, "moderator", "participant", "moderator")), {
    moderators: 2, participants: 1, moderatorUtterances: 6, participantUtterances: 6,
  });
});

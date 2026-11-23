import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, reportFileName } from "./report.ts";

const ok = (id, text = `${id} 발언`) => ({ id, status: "verified", utterance: { id, label: id.split("-")[0], seq: 1, role: "participant", text } });
const ins = (title, evidence, summary = `${title} 요약`) => ({ title, summary, evidence });
const NOW = new Date("2026-11-26T15:30:00Z"); // 한국 시간으로는 11/27 00:30
const build = (insights, extra = {}) => buildReport({ insights, transcriptCount: 8, analyzedAt: "2026-11-25T14:59:59Z", now: NOW, ...extra });

test("머리: 만든 날·전사본 건수·분석한 날은 한국 시간 날짜로 쓴다", () => {
  const r = build([ins("가", [ok("A-01")])]);
  assert.match(r, /^# Opidence 리포트\n\n만든 날 2026\. 11\. 27 · 지금 올라 있는 전사본 8건 · 분석한 날 2026\. 11\. 25\n/);
  assert.doesNotMatch(build([ins("가", [ok("A-01")])], { analyzedAt: null }), /분석한 날/);
  assert.equal(reportFileName(NOW), "opidence-리포트-2026-11-27.md");
});

test("묶음이 하나도 없으면 빈 글이다", () => {
  assert.equal(build([]), "");
});

test("근거로 단 참가자는 중복 없이 정렬해서 쓴다(시스템이 한 일만 말한다)", () => {
  const r = build([ins("가", [ok("C-01"), ok("A-01"), ok("E-01"), ok("A-02")])]);
  assert.match(r, /참가자 3명의 발언을 근거로 달았어요 \(A, C, E\)/);
  assert.doesNotMatch(r, /말했어요/);
});

test("대표 인용: 서로 다른 참가자를 먼저 고르고, 모자라면 남은 근거로 채운다(최대 3개, 근거 순서)", () => {
  const quotes = (r) => [...r.matchAll(/ — 참가자 \w · (\w-\d+)/g)].map((m) => m[1]);
  assert.deepEqual(quotes(build([ins("가", [ok("A-01"), ok("A-02"), ok("C-01"), ok("E-01"), ok("A-03")])])), ["A-01", "C-01", "E-01"]);
  assert.deepEqual(quotes(build([ins("가", [ok("A-01"), ok("A-02"), ok("C-01"), ok("A-03")])])), ["A-01", "A-02", "C-01"]);
  assert.deepEqual(quotes(build([ins("가", [ok("A-01")])])), ["A-01"]);
});

test("인용은 원문과 발언 번호를 함께 쓰고, 진행자·없는 번호는 인용하지도 세지도 않는다", () => {
  const r = build([ins("가", [ok("A-08", "반납이 헷갈려요."), { id: "A-07", status: "moderator" }, { id: "Z-99", status: "not_found" }])]);
  assert.match(r, /> “반납이 헷갈려요\.” — 참가자 A · A-08/);
  assert.match(r, /참가자 1명의 발언을 근거로 달았어요 \(A\)/);
  assert.doesNotMatch(r, /A-07|Z-99/);
});

test("같은 발언이 두 번 연결돼 있어도 한 번만 인용한다", () => {
  const r = build([ins("가", [ok("A-01"), ok("A-01")])]);
  assert.equal(r.match(/^> /gm).length, 1);
});

test("근거가 없는 묶음은 따로 모으고 번호에서 뺀다", () => {
  const r = build([ins("없음1", [{ id: "Z-99", status: "not_found" }]), ins("있음", [ok("A-01")]), ins("없음2", [])]);
  assert.match(r, /## 1\. 있음/);
  assert.match(r, /## 근거를 찾지 못한 묶음 \(2개\)\n\n### 없음1\n\n없음1 요약\n\n원문에서 근거를 찾지 못했어요\.\n\n### 없음2/);
  assert.ok(r.indexOf("## 1. 있음") < r.indexOf("## 근거를 찾지 못한 묶음"));
});

test("Markdown 기호가 든 제목·요약·원문은 이스케이프해서 모양이 깨지지 않는다", () => {
  const r = build([ins("*굵게* # 제목", [ok("A-01", "a_b_c [링크](x) <b> 줄1\n줄2")], "1. 목록처럼 보이는 요약")]);
  assert.match(r, /## 1\. \\\*굵게\\\* \\# 제목/);
  assert.match(r, /\n1\\\. 목록처럼 보이는 요약\n/);
  assert.match(r, /“a\\_b\\_c \\\[링크\\\]\(x\) \\<b\\> 줄1 줄2”/);
});

test("맨 아래에 두 줄 안내가 따로 문단으로 있다", () => {
  const r = build([ins("가", [ok("A-01")])]);
  assert.ok(r.endsWith("---\n\n인용은 원문 그대로예요. 묶음 제목과 요약은 AI가 만들었어요.\n\n근거가 묶음의 뜻과 맞는지는 직접 확인해 주세요.\n"));
});

test("인용이 근거 전체보다 적으면 근거 줄에 몇 개 중 몇 개를 실었는지 붙인다", () => {
  const line = (r) => r.split("\n").find((l) => l.startsWith("참가자 "));
  const five = build([ins("가", [ok("B-01"), ok("E-01"), ok("G-01"), ok("B-02"), ok("E-02")])]);
  assert.equal(line(five), "참가자 3명의 발언을 근거로 달았어요 (B, E, G) · 근거 5개 중 3개를 실었어요");
  const three = build([ins("가", [ok("B-01"), ok("E-01"), ok("G-01")])]);
  assert.equal(line(three), "참가자 3명의 발언을 근거로 달았어요 (B, E, G)"); // 모두 실었으면 붙이지 않는다
  assert.equal(line(build([ins("가", [ok("A-01")])])), "참가자 1명의 발언을 근거로 달았어요 (A)");
});

import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES, PRIORITIES, priorityFor, profileById, scoreText } from "../app/gazette-scoring.ts";

const general = profileById("general");
const hearing = profileById("hearing");
const rank = (priority) => PRIORITIES.indexOf(priority);

test("an amendment to the Medical Devices Regulations is Critical for both profiles", () => {
  const input = { title: "Regulations Amending the Medical Devices Regulations (Post-market Surveillance)", headings: "Proposed Regulations · Health, Dept. of · Food and Drugs Act" };
  const g = scoreText(input, general);
  const h = scoreText(input, hearing);
  assert.equal(g.priority, "Critical", JSON.stringify(g.reasons));
  assert.equal(h.priority, "Critical", "hearing profile inherits general rules even without 'hearing aid'");
  assert.ok(g.score >= 80 && g.score <= 100);
  assert.ok(g.bonuses.some((b) => b.label.includes("Medical Devices Regulations + amendment")));
  assert.ok(g.reasons[0].includes("Medical Devices Regulations"));
  assert.deepEqual(g.topics.slice(0, 1), ["device"]);
});

test("Part II enacted regulation under the Food and Drugs Act about devices ranks Critical", () => {
  const result = scoreText({
    title: "Regulations Amending the Medical Devices Regulations",
    headings: "Regulations (SOR) · Food and Drugs Act · SOR/2026-140",
  }, general);
  assert.equal(result.priority, "Critical");
});

test("a Food and Drugs Act drug-shortage rule is at least Medium and below a device amendment", () => {
  const device = scoreText({ title: "Regulations Amending the Medical Devices Regulations", headings: "Food and Drugs Act" }, general);
  const drug = scoreText({ title: "Regulations Amending the Food and Drug Regulations (Drug Shortages)", headings: "Proposed Regulations · Health, Dept. of · Food and Drugs Act" }, general);
  assert.ok(rank(drug.priority) <= rank("Medium"), `${drug.priority} ${drug.reasons}`);
  assert.ok(device.score > drug.score);
});

test("clearly unrelated items are Very Low and never hidden", () => {
  const fish = scoreText({ title: "Regulations Amending the Atlantic Fishery Regulations, 1985", headings: "Proposed Regulations · Fisheries and Oceans, Dept. of · Fisheries Act" }, general);
  assert.equal(fish.priority, "Very Low", JSON.stringify(fish));
  assert.ok(fish.penalties.length > 0);
  const turkey = scoreText({ title: "Regulations Amending the Canadian Turkey Marketing Quota Regulations, 1990", headings: "Regulations (SOR) · Farm Products Agencies Act" }, general);
  assert.equal(turkey.priority, "Very Low");
  assert.equal(priorityFor(0), "Very Low");
  assert.equal(priorityFor(14), "Very Low");
  assert.equal(priorityFor(15), "Low");
  assert.equal(priorityFor(100), "Critical");
});

test("weak generic terms alone do not reach High, but do with device context", () => {
  const alone = scoreText({ title: "Notice — software update requirements for radio apparatus", headings: "Government notices · Industry, Dept. of · Radiocommunication Act" }, general);
  assert.ok(rank(alone.priority) > rank("High"), `${alone.priority} ${alone.score}`);
  assert.ok(alone.reasons.some((reason) => reason.includes("carry little weight")));
  const withDevice = scoreText({ title: "Guidance on software updates and cybersecurity for medical devices", headings: "Government notices · Health, Dept. of · Food and Drugs Act" }, general);
  assert.ok(rank(withDevice.priority) <= rank("High"), `${withDevice.priority} ${withDevice.score}`);
  assert.ok(withDevice.score > alone.score);
  assert.ok(withDevice.bonuses.some((b) => b.label.includes("cybersecurity")));
});

test("title matches outweigh body matches and repetition is capped", () => {
  const inTitle = scoreText({ title: "Medical device licence fees", body: "Nothing else." }, general);
  const inBody = scoreText({ title: "Notice", body: "This concerns medical device licence fees." }, general);
  assert.ok(inTitle.score > inBody.score);
  const spam = scoreText({ title: "Notice", body: Array(60).fill("medical device").join(" ") }, general);
  const modest = scoreText({ title: "Notice", body: "medical device medical device medical device" }, general);
  assert.equal(spam.score, modest.score);
});

test("the hearing profile boosts hearing concepts and rewards ISED + HAC together", () => {
  const input = { title: "Notice No. SMSE-006-26 — Consultation on RSS-HAC, Hearing Aid Compatibility for wireless devices", headings: "Government notices · Industry, Dept. of · Radiocommunication Act" };
  const g = scoreText(input, general);
  const h = scoreText(input, hearing);
  assert.ok(h.score > g.score);
  assert.ok(rank(h.priority) <= rank("High"), `${h.priority} ${h.score} ${h.reasons}`);
  assert.ok(h.bonuses.some((b) => b.label.includes("ISED + hearing aid compatibility")));
  assert.ok(h.topics.includes("hearing"));
});

test("hearing aid + Bluetooth co-occurrence and battery boosts apply in the hearing profile", () => {
  const item = { title: "Notice — Bluetooth hearing aids and rechargeable batteries", headings: "Government notices · Health, Dept. of" };
  const h = scoreText(item, hearing);
  assert.ok(h.bonuses.some((b) => b.label.includes("Hearing aid + Bluetooth")));
  assert.ok(h.bonuses.some((b) => b.label.includes("batteries")));
  assert.ok(rank(h.priority) <= rank("High"));
});

test("explanations name the depth and the matched concepts", () => {
  const titleOnly = scoreText({ title: "Regulations Amending the Medical Devices Regulations" }, general);
  assert.ok(titleOnly.reasons.at(-1).includes("title and headings only"));
  assert.equal(titleOnly.depth, "title");
  const full = scoreText({ title: "Regulations Amending the Medical Devices Regulations", body: "The Regulations Amending the Medical Devices Regulations introduce mandatory problem reporting and recall obligations." }, general);
  assert.equal(full.depth, "full");
  assert.ok(full.matches.some((m) => m.conceptId === "incident"));
  assert.ok(full.matches.some((m) => m.conceptId === "recall"));
  assert.ok(full.score >= titleOnly.score);
});

test("acronyms are matched case-sensitively and phrases as whole words", () => {
  const ai = scoreText({ title: "Notice to industry regarding AI-enabled medical devices" }, general);
  assert.ok(ai.matches.some((m) => m.conceptId === "ai"));
  const noAi = scoreText({ title: "Notice regarding aircraft maintenance in Mumbai" }, general);
  assert.ok(!noAi.matches.some((m) => m.conceptId === "ai"));
  const mdl = scoreText({ title: "MDL renewal deadline" }, general);
  assert.ok(mdl.matches.some((m) => m.conceptId === "mdl"));
  const words = scoreText({ title: "Recalls of medical devices" }, general);
  assert.ok(words.matches.some((m) => m.conceptId === "recall"));
  assert.ok(words.matches.some((m) => m.conceptId === "medical-device"));
});

test("profiles are discoverable and the fallback profile is General", () => {
  assert.deepEqual(PROFILES.map((profile) => profile.id), ["general", "hearing"]);
  assert.equal(profileById("nope").id, "general");
  assert.equal(profileById(undefined).id, "general");
});

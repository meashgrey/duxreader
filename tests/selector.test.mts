import { expect, test } from "bun:test";
import {
  generatedScore,
  looksGenerated,
  stableClassPrefix,
} from "../lib/inspector/class-names.ts";

test("generated suffixes are recognized across common class conventions", () => {
  for (const token of [
    "X41oTe",
    "mDVuhO",
    "2IazM",
    "tPs7V",
    "0Hm6r",
    "gNfHta",
    "css-1a2b3c",
  ])
    expect(looksGenerated(token)).toBe(true);
  for (const token of [
    "IssueLabel",
    "listItem",
    "container",
    "TokenBase",
    "appHeader",
    "panel",
  ])
    expect(looksGenerated(token)).toBe(false);
  expect(generatedScore("IssueLabel")).toBeLessThan(
    generatedScore("2IazM"),
  );
});

test("generated class tokens collapse to their component prefix", () => {
  expect(stableClassPrefix("listItem__X41oTe")).toBe("listItem");
  expect(stableClassPrefix("prc-Token-IssueLabel-2IazM")).toBe(
    "prc-Token-IssueLabel",
  );
  expect(stableClassPrefix("prc-Token-TokenBase-te5-F")).toBe(
    "prc-Token-TokenBase",
  );
  expect(stableClassPrefix("IssueLabelToken__0H-m6r")).toBe(
    "IssueLabelToken",
  );
  expect(stableClassPrefix("container__mDVuhO")).toBe("container");
  expect(stableClassPrefix("filterLink__OXCGsP")).toBe("filterLink");
});

test("whole generated tokens and internal hashes do not yield prefixes", () => {
  expect(stableClassPrefix("X41oTe")).toBeNull();
  expect(stableClassPrefix("mDVuhO")).toBeNull();
  expect(stableClassPrefix("IssueLabel")).toBeNull();
  expect(stableClassPrefix("listItem")).toBeNull();
  expect(stableClassPrefix("css-1a2b3c")).toBeNull();
  expect(stableClassPrefix("styles-module_gNfHta_appHeader")).toBeNull();
});

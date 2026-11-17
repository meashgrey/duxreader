import { expect, test } from "bun:test";
import {
  isSiteExcluded,
  normalizeSite,
  readExcludedSites,
  setSiteExcluded,
  siteForUrl,
} from "../lib/site-exclusions.ts";

test("site exclusions use hostnames without routes", () => {
  expect(siteForUrl("https://www.example.com/path?q=1")).toBe("example.com");
  expect(siteForUrl("http://sub.example.com/")).toBe("sub.example.com");
  expect(siteForUrl("file:///tmp/example.html")).toBeUndefined();
  expect(siteForUrl("chrome://extensions")).toBeUndefined();
  expect(siteForUrl("not a url")).toBeUndefined();
  expect(normalizeSite("WWW.Example.COM")).toBe("example.com");
});

test("stored exclusion lists ignore invalid entries and normalize hosts", () => {
  expect(
    readExcludedSites([
      "www.github.com",
      "github.com",
      "example.com/path",
      "two words",
      42,
      "",
    ]),
  ).toEqual(["github.com"]);
  expect(readExcludedSites("github.com")).toEqual([]);
});

test("sites can be added to and removed from the blacklist", () => {
  const added = setSiteExcluded([], "www.github.com", true);
  expect(added).toEqual(["github.com"]);
  expect(isSiteExcluded(added, "github.com")).toBe(true);
  expect(isSiteExcluded(added, "www.github.com")).toBe(true);
  expect(isSiteExcluded(added, "example.com")).toBe(false);
  expect(setSiteExcluded(added, "github.com", false)).toEqual([]);
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { truncate, formatDate } from "../src/lib/output.js";

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    const result = truncate("a".repeat(50), 10);
    expect(result.length).toBe(10);
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles exact length", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("uses default max length of 40", () => {
    const short = "short";
    expect(truncate(short)).toBe(short);

    const long = "a".repeat(50);
    expect(truncate(long).length).toBe(40);
  });
});

describe("formatDate", () => {
  it("formats recent dates as relative time", () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatDate(fiveMinAgo)).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const now = new Date();
    const threeHoursAgo = new Date(
      now.getTime() - 3 * 60 * 60 * 1000,
    ).toISOString();
    expect(formatDate(threeHoursAgo)).toBe("3h ago");
  });

  it("formats days ago", () => {
    const now = new Date();
    const fiveDaysAgo = new Date(
      now.getTime() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(formatDate(fiveDaysAgo)).toBe("5d ago");
  });

  it("formats old dates as ISO date", () => {
    expect(formatDate("2020-01-15T00:00:00Z")).toBe("2020-01-15");
  });

  it("formats very recent as 'just now'", () => {
    const now = new Date().toISOString();
    expect(formatDate(now)).toBe("just now");
  });
});

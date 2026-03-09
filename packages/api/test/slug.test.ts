import { describe, it, expect } from "vitest";
import { toSlug, generateUniqueSlug } from "../src/lib/slug.js";

describe("toSlug", () => {
  it("converts name to snake_case", () => {
    expect(toSlug("My Node Type")).toBe("my_node_type");
  });

  it("handles special characters", () => {
    expect(toSlug("Hello, World! (v2)")).toBe("hello_world_v2");
  });

  it("trims leading/trailing underscores", () => {
    expect(toSlug("  --foo--  ")).toBe("foo");
  });

  it("truncates to 64 characters", () => {
    const longName = "a".repeat(100);
    expect(toSlug(longName).length).toBe(64);
  });

  it("handles empty-ish input", () => {
    expect(toSlug("---")).toBe("");
  });
});

describe("generateUniqueSlug", () => {
  it("returns base slug when no collision", () => {
    expect(generateUniqueSlug("Person", [])).toBe("person");
  });

  it("appends _2 on first collision", () => {
    expect(generateUniqueSlug("Person", ["person"])).toBe("person_2");
  });

  it("appends _3 when _2 is also taken", () => {
    expect(generateUniqueSlug("Person", ["person", "person_2"])).toBe(
      "person_3",
    );
  });

  it("skips gaps in suffix sequence", () => {
    expect(
      generateUniqueSlug("Person", ["person", "person_2", "person_3"]),
    ).toBe("person_4");
  });
});

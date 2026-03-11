import { describe, it, expect } from "vitest";
import { parseFilter, filtersToApiFormat, parseSort } from "../src/lib/filter-parser.js";

describe("parseFilter", () => {
  it("parses basic filter 'name[eq]=Alice'", () => {
    const result = parseFilter("name[eq]=Alice");
    expect(result).toEqual({ field: "name", op: "eq", value: "Alice" });
  });

  it("parses contains filter", () => {
    const result = parseFilter("description[contains]=important");
    expect(result).toEqual({
      field: "description",
      op: "contains",
      value: "important",
    });
  });

  it("parses is_null filter", () => {
    const result = parseFilter("email[is_null]=true");
    expect(result).toEqual({ field: "email", op: "is_null", value: "true" });
  });

  it("handles values with spaces", () => {
    const result = parseFilter("name[eq]=Alice Smith");
    expect(result).toEqual({ field: "name", op: "eq", value: "Alice Smith" });
  });

  it("handles values with = sign", () => {
    const result = parseFilter("formula[eq]=a=b");
    expect(result).toEqual({ field: "formula", op: "eq", value: "a=b" });
  });

  it("handles values with brackets", () => {
    const result = parseFilter("notes[contains]=[draft]");
    expect(result).toEqual({
      field: "notes",
      op: "contains",
      value: "[draft]",
    });
  });

  it("handles empty value", () => {
    const result = parseFilter("name[eq]=");
    expect(result).toEqual({ field: "name", op: "eq", value: "" });
  });

  it("throws on missing brackets", () => {
    expect(() => parseFilter("name=Alice")).toThrow("Invalid filter format");
  });

  it("throws on missing operator", () => {
    expect(() => parseFilter("name[]=Alice")).toThrow("Invalid filter operator");
  });

  it("throws on invalid operator", () => {
    expect(() => parseFilter("name[like]=Alice")).toThrow(
      "Invalid filter operator",
    );
  });

  it("throws on missing field name", () => {
    expect(() => parseFilter("[eq]=Alice")).toThrow("missing field name");
  });

  it("throws on completely malformed input", () => {
    expect(() => parseFilter("garbage")).toThrow("Invalid filter format");
  });
});

describe("filtersToApiFormat", () => {
  it("converts single filter", () => {
    const result = filtersToApiFormat([
      { field: "name", op: "eq", value: "Alice" },
    ]);
    expect(result).toEqual({ name: { eq: "Alice" } });
  });

  it("converts multiple filters on different fields", () => {
    const result = filtersToApiFormat([
      { field: "name", op: "eq", value: "Alice" },
      { field: "role", op: "contains", value: "eng" },
    ]);
    expect(result).toEqual({
      name: { eq: "Alice" },
      role: { contains: "eng" },
    });
  });

  it("converts multiple operators on same field", () => {
    const result = filtersToApiFormat([
      { field: "age", op: "eq", value: "30" },
      { field: "age", op: "is_null", value: "false" },
    ]);
    expect(result).toEqual({
      age: { eq: "30", is_null: "false" },
    });
  });
});

describe("parseSort", () => {
  it("parses ascending sort", () => {
    const result = parseSort("name:asc");
    expect(result).toEqual({ field: "name", direction: "asc" });
  });

  it("parses descending sort", () => {
    const result = parseSort("created_at:desc");
    expect(result).toEqual({ field: "created_at", direction: "desc" });
  });

  it("throws on missing direction", () => {
    expect(() => parseSort("name")).toThrow("Invalid sort format");
  });

  it("throws on invalid direction", () => {
    expect(() => parseSort("name:up")).toThrow("Invalid sort format");
  });

  it("throws on too many colons", () => {
    expect(() => parseSort("a:b:c")).toThrow("Invalid sort format");
  });
});

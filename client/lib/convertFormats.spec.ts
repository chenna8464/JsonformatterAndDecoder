import { describe, expect, it } from "vitest";
import { formatToJson, jsonToFormat } from "./convertFormats";

const sample = '{\n  "name": "Ada",\n  "age": 36,\n  "tags": ["x", "y"]\n}';

describe("jsonToFormat", () => {
  it("converts JSON to YAML and round-trips back", () => {
    const yaml = jsonToFormat(sample, "yaml");
    expect(yaml.ok).toBe(true);
    if (yaml.ok) {
      expect(yaml.value).toContain("name: Ada");
      const back = formatToJson(yaml.value, "yaml");
      expect(back.ok).toBe(true);
      if (back.ok) expect(JSON.parse(back.value)).toEqual({ name: "Ada", age: 36, tags: ["x", "y"] });
    }
  });

  it("converts JSON to TOML and round-trips back", () => {
    const toml = jsonToFormat(sample, "toml");
    expect(toml.ok).toBe(true);
    if (toml.ok) {
      const back = formatToJson(toml.value, "toml");
      expect(back.ok).toBe(true);
      if (back.ok) expect(JSON.parse(back.value)).toEqual({ name: "Ada", age: 36, tags: ["x", "y"] });
    }
  });

  it("converts JSON to XML", () => {
    const xml = jsonToFormat('{"root":{"a":1,"b":"two"}}', "xml");
    expect(xml.ok).toBe(true);
    if (xml.ok) expect(xml.value).toContain("<a>1</a>");
  });

  it("rejects a top-level array for TOML with a helpful message", () => {
    const result = jsonToFormat("[1,2,3]", "toml");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/object/i);
  });

  it("rejects invalid JSON", () => {
    const result = jsonToFormat("{not json", "yaml");
    expect(result.ok).toBe(false);
  });
});

describe("formatToJson", () => {
  it("parses YAML into JSON", () => {
    const result = formatToJson("name: Ada\nage: 36\n", "yaml");
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.value)).toEqual({ name: "Ada", age: 36 });
  });

  it("reports a clear error for malformed YAML", () => {
    const result = formatToJson("a: b: c: broken\n  - nope", "yaml");
    expect(result.ok).toBe(false);
  });
});

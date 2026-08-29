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
      if (back.ok)
        expect(JSON.parse(back.value)).toEqual({
          name: "Ada",
          age: 36,
          tags: ["x", "y"],
        });
    }
  });

  it("converts JSON to TOML and round-trips back", () => {
    const toml = jsonToFormat(sample, "toml");
    expect(toml.ok).toBe(true);
    if (toml.ok) {
      const back = formatToJson(toml.value, "toml");
      expect(back.ok).toBe(true);
      if (back.ok)
        expect(JSON.parse(back.value)).toEqual({
          name: "Ada",
          age: 36,
          tags: ["x", "y"],
        });
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
    if (result.ok)
      expect(JSON.parse(result.value)).toEqual({ name: "Ada", age: 36 });
  });

  it("reports a clear error for malformed YAML", () => {
    const result = formatToJson("a: b: c: broken\n  - nope", "yaml");
    expect(result.ok).toBe(false);
  });
});

describe("formatToJson — YAML alias bomb (regression)", () => {
  /**
   * Build a YAML alias bomb: each level is an array of `fan` aliases to the level
   * below, so the expanded tree is fan^levels while the text stays a few hundred
   * bytes.
   */
  const bomb = (levels: number, fan = 9) => {
    let out = `l0: &l0 [${Array(fan).fill('"x"').join(",")}]\n`;
    for (let i = 1; i < levels; i++) {
      out += `l${i}: &l${i} [${Array(fan)
        .fill(`*l${i - 1}`)
        .join(",")}]\n`;
    }
    return (
      out +
      `top: [${Array(fan)
        .fill(`*l${levels - 1}`)
        .join(",")}]\n`
    );
  };

  it("rejects a bomb instead of expanding it", () => {
    const source = bomb(7);
    expect(source.length).toBeLessThan(500); // ~365 bytes in

    const started = Date.now();
    const result = formatToJson(source, "yaml");
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too much data/i);
    // Unfixed this produced a 206 MB string, and ~2 s of frozen tab once
    // pretty-printed. The guard walks the shared-reference DAG, so it is
    // O(unique nodes) and returns effectively instantly.
    expect(elapsed).toBeLessThan(500);
  });

  it("rejects a bomb one level larger without getting slower", () => {
    const started = Date.now();
    expect(formatToJson(bomb(9), "yaml").ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("rejects a self-referencing anchor rather than throwing on a cycle", () => {
    const result = formatToJson("a: &a\n  self: *a\n", "yaml");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too much data/i);
  });

  it("still converts ordinary YAML that reuses anchors legitimately", () => {
    // Shared-defaults anchors are idiomatic (docker-compose, CI configs) and must
    // keep working — the guard is a size ceiling, not an anchor ban.
    //
    // This reuses the anchor directly rather than through a `<<` merge key:
    // merge keys are a YAML 1.1 type that js-yaml's default schema does not
    // resolve, so `<<` would stay a literal key. Pre-existing behaviour,
    // unrelated to the expansion guard.
    const result = formatToJson(
      [
        "defaults: &defaults",
        "  retries: 3",
        "  timeout: 30",
        "a: *defaults",
        "b: *defaults",
        "",
      ].join("\n"),
      "yaml",
    );
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.value!)).toEqual({
      defaults: { retries: 3, timeout: 30 },
      a: { retries: 3, timeout: 30 },
      b: { retries: 3, timeout: 30 },
    });
  });
});

describe("formatToJson — parser hardening (documented behaviour)", () => {
  // These are guarantees the dependencies provide rather than things this code
  // implements. The tests exist so a future version bump that regresses one of
  // them fails here instead of in the wild.
  it("refuses XML external entities (XXE)", () => {
    const result = formatToJson(
      '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>',
      "xml",
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("root:");
  });

  it("refuses an XML element named __proto__", () => {
    const result = formatToJson(
      "<r><__proto__><p>x</p></__proto__></r>",
      "xml",
    );
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>).p).toBeUndefined();
  });

  it("refuses the YAML !!js/function tag", () => {
    expect(
      formatToJson('x: !!js/function "function(){return 1}"', "yaml").ok,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { repairJson } from "./jsonRepair";

const parse = (input: string) => JSON.parse(repairJson(input).value);

describe("repairJson", () => {
  it("reformats already-valid JSON without marking it repaired", () => {
    const result = repairJson('{"a":1}');
    expect(result.repaired).toBe(false);
    expect(result.value).toBe('{\n  "a": 1\n}');
  });

  it("quotes unquoted keys and single-quoted strings", () => {
    expect(parse("{name: 'Ada', age: 36}")).toEqual({ name: "Ada", age: 36 });
  });

  it("keeps apostrophes inside single-quoted strings", () => {
    expect(parse("{note: 'it's fine', msg: \"don't stop\"}")).toEqual({ note: "it's fine", msg: "don't stop" });
  });

  it("preserves emails, URLs, and special characters in strings", () => {
    expect(parse('{"email": "user\'s@example.com", link: https://example.com/a?b=1}')).toEqual({
      email: "user's@example.com",
      link: "https://example.com/a?b=1",
    });
  });

  it("fixes trailing and missing commas", () => {
    expect(parse('{"a": 1 "b": 2,}')).toEqual({ a: 1, b: 2 });
    expect(parse('{"list": [1 2 3,]}')).toEqual({ list: [1, 2, 3] });
  });

  it("strips comments", () => {
    expect(parse('{a: 1, // note\n /* block */ b: 2}')).toEqual({ a: 1, b: 2 });
  });

  it("converts Python/JS literals", () => {
    expect(parse("{x: True, y: None, z: NaN, w: undefined, v: False}")).toEqual({ x: true, y: null, z: null, w: null, v: false });
  });

  it("normalizes lax numbers", () => {
    expect(parse('{"a": .5, "b": +2, "c": 0x1A}')).toEqual({ a: 0.5, b: 2, c: 26 });
  });

  it("escapes raw newlines inside strings", () => {
    expect(parse('{"msg": "hello\nworld"}')).toEqual({ msg: "hello\nworld" });
  });

  it("closes unterminated strings and brackets", () => {
    expect(parse('{"a": {"b": [1, 2')).toEqual({ a: { b: [1, 2] } });
    expect(parse('{"a": "unterminated')).toEqual({ a: "unterminated" });
  });

  it("stops an unterminated string at the line end instead of swallowing the document", () => {
    expect(parse('{\n  "features": [\n    "analytics",\n    "webhooks]\n  }\n}')).toEqual({
      features: ["analytics", "webhooks"],
    });
  });

  it("closes strings missing their end quote at the line break, even with quotes later in the document", () => {
    const input = `{
      "project": {
        "name": "Northstar API",
        "version": "2.4.0
        "environment": "production"
      },
      "settings": {
        "logging": true
        "features": [
          "analytics
          "webhooks
        ]
      }
    }`;
    expect(parse(input)).toEqual({
      project: { name: "Northstar API", version: "2.4.0", environment: "production" },
      settings: { logging: true, features: ["analytics", "webhooks"] },
    });
  });

  it("scrubs baked-in artifacts from valid JSON: trailing newline+indent in strings, stray quotes in keys", () => {
    const input = JSON.stringify({
      'environment"': "production",
      name: "Update user profile\n        ",
      'method"': "PATCh\n      ",
      list: ["analytics\n      \n        ", "ok"],
    });
    const result = repairJson(input);
    expect(result.repaired).toBe(true);
    expect(JSON.parse(result.value)).toEqual({
      environment: "production",
      name: "Update user profile",
      method: "PATCh",
      list: ["analytics", "ok"],
    });
  });

  it("keeps intentional newlines in the middle of strings", () => {
    const result = repairJson('{"msg": "hello\\nworld"}');
    expect(result.repaired).toBe(false);
    expect(JSON.parse(result.value)).toEqual({ msg: "hello\nworld" });
  });

  it("handles smart quotes", () => {
    expect(parse('{“name”: “Ada”}')).toEqual({ name: "Ada" });
  });

  it("wraps multiple root values in an array", () => {
    expect(parse('{"a":1} {"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("treats bare words as strings", () => {
    expect(parse("{status: active, date: 2024-05-18}")).toEqual({ status: "active", date: "2024-05-18" });
  });

  it("repairs missing opening braces and brackets after key colons", () => {
    const invalidJson = `{
  "project": 
    "name": "Northstar API",
    "version": "2.4.0",
    "environment": "production"
  },
  "endpoints": 
    {
      "name": "Get user profile",
      "method": "GET",
      "path": "/api/v1/users/:id",
      "auth": true
    },
    {
      "name": "Update user profile",
      "method": "PATCH",
      "path": "/api/v1/users/:id",
      "auth": true
    }
  ],
  "settings": {
    "rateLimit": 100,
    "logging": true,
    "features": [
      "analytics",
      "webhooks"
    ]
  }
}`;
    const result = repairJson(invalidJson);
    expect(result.repaired).toBe(true);
    expect(JSON.parse(result.value)).toEqual({
      project: {
        name: "Northstar API",
        version: "2.4.0",
        environment: "production",
      },
      endpoints: [
        {
          name: "Get user profile",
          method: "GET",
          path: "/api/v1/users/:id",
          auth: true,
        },
        {
          name: "Update user profile",
          method: "PATCH",
          path: "/api/v1/users/:id",
          auth: true,
        },
      ],
      settings: {
        rateLimit: 100,
        logging: true,
        features: ["analytics", "webhooks"],
      },
    });
  });

  it("repairs keys missing closing quote before colon", () => {
    const input = `{
  "project": {
    "name": "Northstar API",
    "version: "2.4.0",
    "environment": "production"
  }
}`;
    const result = repairJson(input);
    expect(result.repaired).toBe(true);
    expect(JSON.parse(result.value)).toEqual({
      project: {
        name: "Northstar API",
        version: "2.4.0",
        environment: "production",
      },
    });
  });

  it("repairs objects with missing key quotes, unclosed string values, and missing line commas", () => {
    const input = `{
      "name: "Update user profile",
      "method": "PATCH
      path": "/api/v1/users/:id
      "auth": true
    }`;
    const result = repairJson(input);
    expect(result.repaired).toBe(true);
    expect(JSON.parse(result.value)).toEqual({
      name: "Update user profile",
      method: "PATCH",
      path: "/api/v1/users/:id",
      auth: true,
    });
  });

  it("reports an error for hopeless input", () => {
    const result = repairJson("");
    expect(result.repaired).toBe(false);
    expect(result.error).toBeTruthy();
  });
});


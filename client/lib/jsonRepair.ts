import { jsonrepair } from "jsonrepair";

export type RepairResult = {
  value: string;
  repaired: boolean;
  error?: string;
};

/**
 * Preprocess structural issues in malformed JSON such as missing opening `{` or `[`
 * after key colons (`"key":`).
 */
function preprocessStructuralMissingContainers(text: string): string {
  const lines = text.split(/\r?\n/);
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    const keyColonMatch = line.match(/^(\s*"?[A-Za-z0-9_$-]+"?\s*:\s*)$/);
    if (keyColonMatch) {
      let nextLineIdx = i + 1;
      while (nextLineIdx < lines.length && lines[nextLineIdx].trim() === "") {
        nextLineIdx++;
      }
      if (nextLineIdx < lines.length) {
        const nextLine = lines[nextLineIdx].trim();
        if (/^"?[A-Za-z0-9_$-]+"?\s*:/.test(nextLine)) {
          line = line + " {";
        } else if (/^\{/.test(nextLine) || /^(?!\s*"?[A-Za-z0-9_$-]+"?\s*:)/.test(nextLine)) {
          let depthBraces = 0;
          let depthBrackets = 0;
          let hasClosingBracket = false;
          let hasComma = false;
          for (let j = nextLineIdx; j < lines.length; j++) {
            const l = lines[j];
            depthBraces += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
            depthBrackets += (l.match(/\[/g) || []).length - (l.match(/\]/g) || []).length;
            if (l.includes(",")) hasComma = true;
            if (depthBraces < 0) break;
            if (depthBrackets < 0 || l.trim().startsWith("]") || l.trim().startsWith("],")) {
              hasClosingBracket = true;
              break;
            }
          }
          if (hasClosingBracket && hasComma && depthBrackets <= 0 && depthBraces >= 0) {
            line = line + " [";
          } else if (depthBraces < 0) {
            line = line + " {";
          }
        }
      }
    }
    processedLines.push(line);
  }

  return processedLines.join("\n");
}


/**
 * Tolerant JSON repair: parses malformed JSON character-by-character and
 * rebuilds a valid document. Handles single/smart quotes, unquoted keys,
 * comments, trailing/missing commas, Python/JS literals (True, None,
 * undefined, NaN, Infinity), lax numbers (.5, +2, 0x1A), raw newlines in
 * strings, unterminated strings, missing `{`/`[` containers, and unclosed brackets.
 */
export function repairJson(source: string, indent = 2): RepairResult {
  // Fast path: already valid JSON — reformat and scrub leftover artifacts.
  try {
    const parsed = JSON.parse(source);
    const { value, changed } = cleanArtifacts(parsed);
    return { value: JSON.stringify(value, null, indent), repaired: changed };
  } catch {
    // fall through
  }

  const preprocessed = preprocessStructuralMissingContainers(source);

  // Attempt 1: Valid JSON after structural container preprocessing
  try {
    const parsed = JSON.parse(preprocessed);
    const { value } = cleanArtifacts(parsed);
    return { value: JSON.stringify(value, null, indent), repaired: true };
  } catch {
    // fall through
  }

  // Attempt 2: TolerantParser on preprocessed text
  try {
    const parser = new TolerantParser(preprocessed);
    const parsed = parser.parseDocument();
    return { value: JSON.stringify(cleanArtifacts(parsed).value, null, indent), repaired: true };
  } catch {
    // fall through
  }

  // Attempt 3: TolerantParser on original raw source
  try {
    const parser = new TolerantParser(source);
    const parsed = parser.parseDocument();
    return { value: JSON.stringify(cleanArtifacts(parsed).value, null, indent), repaired: true };
  } catch {
    // fall through
  }

  // Attempt 4: jsonrepair library on preprocessed text
  try {
    const repairedText = jsonrepair(preprocessed);
    const parsed = JSON.parse(repairedText);
    const { value } = cleanArtifacts(parsed);
    return { value: JSON.stringify(value, null, indent), repaired: true };
  } catch {
    // fall through
  }

  // Attempt 5: jsonrepair library on original raw source
  try {
    const repairedText = jsonrepair(source);
    const parsed = JSON.parse(repairedText);
    const { value } = cleanArtifacts(parsed);
    return { value: JSON.stringify(value, null, indent), repaired: true };
  } catch (error) {
    return {
      value: source,
      repaired: false,
      error: error instanceof Error ? error.message : "Could not repair this JSON",
    };
  }
}





/**
 * Scrub artifacts left behind by careless editing or previous bad repairs:
 * string values ending in a newline followed only by indentation spaces, and
 * object keys with stray trailing quotes. These patterns are never intentional
 * in real-world JSON documents.
 */
function cleanArtifacts(input: unknown): { value: unknown; changed: boolean } {
  let changed = false;
  const cleanString = (text: string): string => {
    const cleaned = text.replace(/\s*[\n\r]\s*$/, "");
    if (cleaned !== text) changed = true;
    return cleaned;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return cleanString(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const cleanKey = cleanString(key).replace(/"+$/, "");
        if (cleanKey !== key) changed = true;
        result[cleanKey || key] = walk(child);
      }
      return result;
    }
    return value;
  };
  return { value: walk(input), changed };
}

class TolerantParser {
  private position = 0;

  constructor(private readonly text: string) {}

  parseDocument(): unknown {
    this.skipFiller();
    if (this.position >= this.text.length) throw new Error("Empty input");
    const value = this.parseValue();
    this.skipFiller();
    // Multiple root values (e.g. concatenated objects) — wrap them in an array.
    if (this.position < this.text.length) {
      const values = [value];
      while (this.position < this.text.length) {
        this.skipFiller();
        if (this.position >= this.text.length) break;
        // Stray separators or orphan closing brackets after the root value.
        if (/[,;\]}]/.test(this.current())) {
          this.position++;
          continue;
        }
        values.push(this.parseValue());
      }
      return values.length === 1 ? values[0] : values;
    }
    return value;
  }

  private current(): string {
    return this.text[this.position];
  }

  /** Skip whitespace, commas handled by callers; here: whitespace + comments. */
  private skipFiller(): void {
    while (this.position < this.text.length) {
      const char = this.current();
      if (/\s/.test(char)) {
        this.position++;
      } else if (char === "/" && this.text[this.position + 1] === "/") {
        while (this.position < this.text.length && this.current() !== "\n") this.position++;
      } else if (char === "/" && this.text[this.position + 1] === "*") {
        const end = this.text.indexOf("*/", this.position + 2);
        this.position = end < 0 ? this.text.length : end + 2;
      } else {
        break;
      }
    }
  }

  private parseValue(): unknown {
    this.skipFiller();
    if (this.position >= this.text.length) throw new Error("Unexpected end of input");
    const char = this.current();
    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"' || char === "'" || char === "“" || char === "”" || char === "‘" || char === "’" || char === "`") {
      return this.parseString();
    }
    return this.parseLiteral();
  }

  private parseObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.position++; // consume {
    for (;;) {
      this.skipFiller();
      if (this.position >= this.text.length) return result; // unclosed object
      if (this.current() === "}") {
        this.position++;
        return result;
      }
      if (this.current() === "," || this.current() === ";") {
        this.position++;
        continue;
      }
      const key = this.parseKey();
      this.skipFiller();
      if (this.current() === ":" || this.current() === "=") this.position++;
      else if (this.text.slice(this.position, this.position + 2) === "=>") this.position += 2;
      result[key] = this.parseValue();
    }
  }

  private parseKey(): string {
    const char = this.current();
    if (char === '"' || char === "'" || char === "“" || char === "”" || char === "‘" || char === "’" || char === "`") {
      return this.parseString();
    }
    // Bare key: read until :, =, whitespace, or structural char.
    const start = this.position;
    while (this.position < this.text.length && !/[:=\s,{}[\]]/.test(this.current())) this.position++;
    const key = this.text.slice(start, this.position);
    if (!key) throw new Error(`Expected object key at position ${this.position}`);
    return key;
  }

  private parseArray(): unknown[] {
    const result: unknown[] = [];
    this.position++; // consume [
    for (;;) {
      this.skipFiller();
      if (this.position >= this.text.length) return result; // unclosed array
      if (this.current() === "]") {
        this.position++;
        return result;
      }
      if (this.current() === "," || this.current() === ";") {
        this.position++;
        continue;
      }
      result.push(this.parseValue());
    }
  }

  private parseString(): string {
    const openChar = this.current();
    const closers: Record<string, string[]> = {
      '"': ['"', "”", "“"],
      "'": ["'", "’"],
      "`": ["`"],
      "“": ["”", "“", '"'],
      "”": ["”", "“", '"'],
      "‘": ["’", "'"],
      "’": ["’", "'"],
    };
    const closing = closers[openChar] ?? ['"'];
    this.position++;
    // No closing quote anywhere ahead: the string is unterminated. Stop at
    // the first newline or structural character so we don't swallow the rest
    // of the document into the string.
    const remainder = this.text.slice(this.position);
    if (!closing.some((quote) => remainder.includes(quote))) {
      let result = "";
      while (this.position < this.text.length && !/[,\]}\n]/.test(this.current())) {
        result += this.current();
        this.position++;
      }
      return result.trimEnd();
    }
    let result = "";
    while (this.position < this.text.length) {
      const char = this.current();
      if (char === "\\") {
        const next = this.text[this.position + 1];
        const escapes: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", "/": "/", "\\": "\\", '"': '"', "'": "'", "`": "`" };
        if (next === "u") {
          const hex = this.text.slice(this.position + 2, this.position + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(parseInt(hex, 16));
            this.position += 6;
            continue;
          }
        }
        if (next in escapes) {
          result += escapes[next];
          this.position += 2;
          continue;
        }
        result += next ?? "";
        this.position += 2;
        continue;
      }
      if (char === "\n") {
        // Raw newlines are invalid in JSON strings. If the next line starts
        // with a quote or a structural character, this string is missing its
        // closing quote — end it here instead of sewing lines together.
        let lookahead = this.position + 1;
        while (lookahead < this.text.length && /[ \t\r]/.test(this.text[lookahead])) lookahead++;
        const nextChar = this.text[lookahead];
        if (nextChar === undefined || /["'“”‘’`{}[\]]/.test(nextChar)) {
          return result.trimEnd();
        }
      }
      if (closing.includes(char)) {
        // An apostrophe inside a single-quoted string ("it's") — treat as
        // content when it's followed by a word character.
        if ((openChar === "'" || openChar === "‘" || openChar === "’") && /[A-Za-z0-9]/.test(this.text[this.position + 1] ?? "") && /[A-Za-z0-9]/.test(this.text[this.position - 1] ?? "")) {
          result += char;
          this.position++;
          continue;
        }
        this.position++;
        return result;
      }
      result += char;
      this.position++;
    }
    return result; // unterminated string: close at EOF
  }

  private isNumberOrKeyword(raw: string): boolean {
    const lower = raw.toLowerCase();
    if (["true", "false", "null", "none", "undefined", "nil", "nan", "infinity", "-infinity", "+infinity"].includes(lower)) return true;
    return /^[+-]?0x[0-9a-f]+$/i.test(raw) || /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(raw);
  }

  private parseLiteral(): unknown {
    const start = this.position;
    while (this.position < this.text.length) {
      const char = this.current();
      // Keep "://" so bare URLs (https://…) survive as one token.
      if (char === ":" && this.text.slice(this.position, this.position + 3) === "://") {
        this.position += 3;
        continue;
      }
      if (/[,:\]}{[\s"'“”‘’`]/.test(char)) break;
      this.position++;
    }
    let raw = this.text.slice(start, this.position).trim();
    if (!raw) throw new Error(`Unexpected character at position ${start}`);
    // Numbers and keywords end at whitespace (fixes "[1 2 3]"); anything else
    // is a bare string that may contain spaces — keep reading to the next
    // structural character.
    if (!this.isNumberOrKeyword(raw)) {
      while (this.position < this.text.length) {
        const char = this.current();
        if (char === ":" && this.text.slice(this.position, this.position + 3) === "://") {
          this.position += 3;
          continue;
        }
        if (/[,:\]}{[\n"'“”‘’`]/.test(char)) break;
        this.position++;
      }
      raw = this.text.slice(start, this.position).trim();
    }
    const lower = raw.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    if (lower === "null" || lower === "none" || lower === "undefined" || lower === "nil") return null;
    if (lower === "nan" || lower === "infinity" || lower === "-infinity" || lower === "+infinity") return null;
    if (/^[+-]?0x[0-9a-f]+$/i.test(raw)) return parseInt(raw, 16);
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(raw)) return Number(raw);
    // ISO-ish dates, emails, URLs, and any other bare word become strings.
    return raw;
  }
}

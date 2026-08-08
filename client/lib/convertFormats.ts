import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { parse as tomlParse, stringify as tomlStringify } from "smol-toml";

export type ConvertFormat = "yaml" | "xml" | "toml";

export type FormatInfo = {
  id: ConvertFormat;
  label: string;
  ext: string;
  /** TOML/XML can't represent every JSON shape (e.g. a top-level array or scalar) */
  note?: string;
};

export const CONVERT_FORMATS: FormatInfo[] = [
  { id: "yaml", label: "YAML", ext: "yaml" },
  { id: "xml", label: "XML", ext: "xml", note: "XML needs a single root object." },
  { id: "toml", label: "TOML", ext: "toml", note: "TOML needs a top-level object (no arrays/scalars at the root)." },
];

const xmlParser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: true, trimValues: true });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, format: true, indentBy: "  " });

// Flat (non-discriminated) shape: this project builds with strictNullChecks
// off, where TypeScript won't narrow a discriminated union on its false branch.
// Keeping both fields always-accessible avoids that pitfall.
export type ConvertResult = { ok: boolean; value?: string; error?: string };

/** Convert a JSON string into YAML / XML / TOML. */
export function jsonToFormat(jsonString: string, format: ConvertFormat): ConvertResult {
  let value: unknown;
  try {
    value = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: "The document is not valid JSON. Fix it (or hit Format) first." };
  }

  try {
    if (format === "yaml") {
      return { ok: true, value: yamlDump(value, { indent: 2, lineWidth: 120, noRefs: true }) };
    }
    if (format === "toml") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, error: "TOML needs a top-level object. Wrap arrays/scalars in an object first." };
      }
      return { ok: true, value: tomlStringify(value as Record<string, unknown>) };
    }
    // XML
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "XML needs a single root object. Wrap arrays/scalars in an object first." };
    }
    return { ok: true, value: xmlBuilder.build(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : `Could not convert to ${format.toUpperCase()}.` };
  }
}

/** Convert YAML / XML / TOML text back into a formatted JSON string. */
export function formatToJson(text: string, format: ConvertFormat): ConvertResult {
  try {
    let value: unknown;
    if (format === "yaml") value = yamlLoad(text);
    else if (format === "toml") value = tomlParse(text);
    else value = xmlParser.parse(text);
    return { ok: true, value: JSON.stringify(value, null, 2) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : `Could not parse the ${format.toUpperCase()}.` };
  }
}

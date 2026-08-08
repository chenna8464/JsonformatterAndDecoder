// JSON → typed model/code generation, powered by quicktype-core.
// quicktype-core is ~1MB, so it is imported dynamically (code-split) and only
// downloaded the first time the user actually generates code — it never touches
// the main bundle or first paint.

export type CodegenLanguage = {
  /** quicktype target language id */
  id: string;
  label: string;
  /** file extension for downloads */
  ext: string;
  /** CodeMirror-ish hint / short description */
  hint?: string;
  rendererOptions?: Record<string, string>;
};

export const CODEGEN_LANGUAGES: CodegenLanguage[] = [
  { id: "typescript", label: "TypeScript", ext: "ts", hint: "interfaces" },
  { id: "typescript-zod", label: "TypeScript (Zod)", ext: "ts", hint: "zod schemas" },
  { id: "python", label: "Python (Pydantic)", ext: "py", rendererOptions: { "python-version": "3.7", "pydantic-base-model": "true" } },
  { id: "python", label: "Python (dataclass)", ext: "py", rendererOptions: { "python-version": "3.7" } },
  { id: "go", label: "Go", ext: "go" },
  { id: "java", label: "Java", ext: "java" },
  { id: "kotlin", label: "Kotlin", ext: "kt" },
  { id: "csharp", label: "C#", ext: "cs" },
  { id: "rust", label: "Rust", ext: "rs" },
  { id: "swift", label: "Swift", ext: "swift" },
  { id: "dart", label: "Dart", ext: "dart" },
  { id: "ruby", label: "Ruby", ext: "rb" },
  { id: "schema", label: "JSON Schema", ext: "json" },
];

export type CodegenResult = { code: string; error?: undefined } | { code: ""; error: string };

/**
 * Generate typed source code for `language` from a JSON sample string.
 * `rootName` becomes the top-level type name.
 */
export async function generateCode(
  jsonSample: string,
  language: CodegenLanguage,
  rootName = "Root",
): Promise<CodegenResult> {
  // Validate JSON up front for a clean error message.
  try {
    JSON.parse(jsonSample);
  } catch {
    return { code: "", error: "The document is not valid JSON. Fix it (or hit Format) before generating code." };
  }

  try {
    const { InputData, jsonInputForTargetLanguage, quicktype } = await import("quicktype-core");
    // language.id is one of quicktype's known target ids, but it's typed as a
    // plain string here; cast to the function's own parameter type.
    const langId = language.id as Parameters<typeof jsonInputForTargetLanguage>[0];
    const jsonInput = jsonInputForTargetLanguage(langId);
    await jsonInput.addSource({ name: rootName.trim() || "Root", samples: [jsonSample] });
    const inputData = new InputData();
    inputData.addInput(jsonInput);
    const { lines } = await quicktype({
      inputData,
      lang: langId,
      rendererOptions: language.rendererOptions,
    });
    return { code: lines.join("\n") };
  } catch (error) {
    return { code: "", error: error instanceof Error ? error.message : "Could not generate code for this document." };
  }
}

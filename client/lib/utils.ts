import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getJsonErrorLine(text: string): { line: number | null; message: string | null } {
  if (!text.trim()) return { line: null, message: null };
  try {
    JSON.parse(text);
    return { line: null, message: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Syntax error";

    // 1. Match V8 / Chrome position: "at position 120"
    const posMatch = message.match(/at position (\d+)/i);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const line = text.slice(0, Math.min(pos, text.length)).split("\n").length;
      return { line, message };
    }

    // 2. Match line number: "line 6"
    const lineMatch = message.match(/line (\d+)/i);
    if (lineMatch) {
      const line = parseInt(lineMatch[1], 10);
      return { line, message };
    }

    return { line: 1, message };
  }
}

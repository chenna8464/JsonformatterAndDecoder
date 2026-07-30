export type SharePayload = {
  name: string;
  json: string;
  compare?: string;
};

// Spreading every byte as fromCharCode(...bytes) blows the call stack on large
// documents — chunk the conversion instead so big JSON still shares correctly.
const bytesToBinaryString = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000;
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return result;
};

const encodeBase64Url = (text: string): string =>
  btoa(bytesToBinaryString(new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const decodeBase64Url = (encoded: string): string => {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Build a self-contained share link: the document travels in the URL hash, so no server or third party ever sees it. */
export function buildShareLink(payload: SharePayload): string {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${window.location.origin}${window.location.pathname}#share=${encoded}`;
}

export function readShareLink(hash: string): SharePayload | null {
  const match = hash.match(/#share=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(match[1]));
    if (typeof payload?.json !== "string") return null;
    return {
      name: typeof payload.name === "string" && payload.name ? payload.name : "shared.json",
      json: payload.json,
      compare: typeof payload.compare === "string" ? payload.compare : undefined,
    };
  } catch {
    return null;
  }
}

/** Clipboard copy with a fallback for older browsers/insecure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadFile(name: string, content: string, type = "application/json"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

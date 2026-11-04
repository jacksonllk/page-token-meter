// Addresses that point to a file, not a web page. Kept apart from measure.ts so the browser can use it too.
const FILE_TYPES: Record<string, string> = {
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  txt: "text",
  md: "Markdown",
  markdown: "Markdown",
  csv: "CSV",
};

// The file type of an address ending in a file extension, such as "JSON" for /openapi.json. null for a web page.
export function fileType(url: string): string | null {
  try {
    const ext = new URL(url).pathname.match(/\.([a-z]+)$/i)?.[1].toLowerCase();
    return (ext && FILE_TYPES[ext]) ?? null;
  } catch {
    return null;
  }
}

// How Whole site treats an address from an llms.txt:
// "page": a web page or a Markdown copy of one (.md). Counts towards the page total.
// "file": an OpenAPI spec (.json, .yaml) or a long text file such as llms-full.txt. Listed apart from the pages.
// "skip": sitemaps and feeds (.xml) and data (.csv). Made for crawlers and scripts, not for reading.
export function llmsEntryKind(url: string): "page" | "file" | "skip" {
  const type = fileType(url);
  if (type === "XML" || type === "CSV") return "skip";
  if (type === "JSON" || type === "YAML" || type === "text") return "file";
  return "page";
}

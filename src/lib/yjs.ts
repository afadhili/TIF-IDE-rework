import * as Y from "yjs";

export const ydocs = new Map<string, Y.Doc>();

export function getYDoc(filePath: string): Y.Doc {
  const key = filePath.replace(/[/\\]/g, "_");
  if (!ydocs.has(key)) {
    const doc = new Y.Doc();
    ydocs.set(key, doc);
  }
  return ydocs.get(key)!;
}

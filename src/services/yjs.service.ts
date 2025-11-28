import * as Y from "yjs";
import { saveFile } from "./files.service";

const yDocuments = new Map<string, Y.Doc>();
const savingTimeouts = new Map<string, NodeJS.Timeout>();

const SAVE_DEBOUNCE_TIME = 2000;

export const getOrCreateYDoc = (fileId: string): Y.Doc => {
  let doc = yDocuments.get(fileId);
  if (!doc) {
    doc = new Y.Doc();
    yDocuments.set(fileId, doc);
  }
  return doc;
};

export const initializeYDoc = (fileId: string, content: string): Y.Doc => {
  const doc = getOrCreateYDoc(fileId);
  const yText = doc.getText("monaco");

  // Only initialize if empty
  if (yText.length === 0 && content) {
    yText.insert(0, content);
  }

  return doc;
};

export const applyUpdate = (fileId: string, update: Uint8Array): void => {
  const doc = getOrCreateYDoc(fileId);
  Y.applyUpdate(doc, update);
};

export const getYText = (fileId: string): Y.Text => {
  const doc = getOrCreateYDoc(fileId);
  return doc.getText("monaco");
};

export const scheduleFileSave = (
  filePath: string,
  fileId: string,
  callback?: (success: boolean) => void,
  time?: number,
): void => {
  // Clear existing timeout
  const existingTimeout = savingTimeouts.get(fileId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Schedule new save
  const timeout = setTimeout(async () => {
    const yText = getYText(fileId);
    const content = yText.toString();

    const success = await saveFile(filePath, content);

    if (callback) {
      callback(success);
    }

    savingTimeouts.delete(fileId);
  }, time || SAVE_DEBOUNCE_TIME);

  savingTimeouts.set(fileId, timeout);
};

export const cleanupYDoc = (fileId: string): void => {
  // Clear any pending save
  const timeout = savingTimeouts.get(fileId);
  if (timeout) {
    clearTimeout(timeout);
    savingTimeouts.delete(fileId);
  }

  // Remove Y.Doc
  const doc = yDocuments.get(fileId);
  if (doc) {
    doc.destroy();
    yDocuments.delete(fileId);
  }
};

export const getDocumentState = (fileId: string): Uint8Array => {
  const doc = getOrCreateYDoc(fileId);
  return Y.encodeStateAsUpdate(doc);
};

export const hasActiveConnections = (fileId: string): boolean => {
  return yDocuments.has(fileId);
};

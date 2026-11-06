import { z } from "zod";
import type { ConfigRules } from "./types";

const driveId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const selectedOperation = (config: Record<string, unknown>) => Object.hasOwn(config, "operation") ? config.operation : "list";
const isListing = (config: Record<string, unknown>) => ["list", "search"].includes(String(selectedOperation(config)));
const pageToken = z.string().refine((value) => {
  if (!value) return true;
  if (value.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
});
export const drive: ConfigRules = {
  operation: { schema: z.enum(["list", "search", "uploadText", "downloadText"]), message: "Choose a valid Google Drive operation." },
  query: { schema: z.string(), when: (config) => selectedOperation(config) === "search", message: "Enter a valid search query." },
  collectPages: { schema: z.boolean(), when: isListing, message: "Choose whether to collect additional results." },
  pageToken: { schema: pageToken, when: isListing, message: "Enter a valid Google Drive continuation token." },
  fileId: { schema: z.string().refine((value) => !!value.trim()), required: true, when: (config) => selectedOperation(config) === "downloadText", message: "Choose a file to download." },
  name: { schema: z.string().min(1), required: true, when: (config) => selectedOperation(config) === "uploadText", message: "Enter a file name." },
  text: { schema: z.string(), when: (config) => selectedOperation(config) === "uploadText", message: "Enter text to upload." },
};
export const driveGetFile: ConfigRules = {
  fileId: { schema: driveId, required: true, message: "Choose a valid Google Drive file or folder." },
};
export const driveCreateFolder: ConfigRules = {
  parentId: { schema: z.union([z.literal(""), driveId]), message: "Choose a valid Google Drive parent folder." },
  name: { schema: z.string().refine((value) => !!value.trim() && value.trim().length <= 255 && !/[\u0000-\u001f\u007f]/.test(value.trim())), required: true, message: "Enter a folder name of at most 255 characters." },
};

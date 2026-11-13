import { z } from "zod";
import type { ConfigRules } from "./types";

const id = { schema: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), required: true, message: "Choose a valid Google document." };
export const docsCreate: ConfigRules = {
  title: { schema: z.string().trim().min(1).max(255), required: true, message: "Enter a document title." },
};
export const docsGet: ConfigRules = { documentId: id };
export const docsUpdate: ConfigRules = {
  documentId: id,
  operation: { schema: z.enum(["append", "replace"]), required: true, message: "Choose an action." },
  find: { schema: z.string().min(1).max(10000), required: true, when: (config) => config.operation === "replace", dependsOn: ["operation"], message: "Enter text to find." },
  text: { schema: z.string().max(100000), required: true, matches: (value, config) => config.operation !== "append" || typeof value === "string" && value.length > 0, dependsOn: ["operation"], message: "Enter text within the size limit." },
};

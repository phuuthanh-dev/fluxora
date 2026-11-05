import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

const id = (label: string): FieldRule => ({ schema: z.string().regex(/^[a-f0-9]{24}$/i), required: true, message: `Choose a valid Trello ${label}.` });
const boardId = id("board"), listId = id("list"), cardId = id("card");
const title = { schema: z.string().refine((value) => !!value.trim() && value.trim().length <= 500), message: "Enter a card title of at most 500 characters." };
const description = { schema: z.string().max(16_000), message: "Enter a card description of at most 16,000 characters." };
const limit = { schema: z.number().int().min(1).max(50), message: "Enter a limit between 1 and 50." };
export const trelloCreate: ConfigRules = { boardId, listId, title: { ...title, required: true }, description };
export const trelloGet: ConfigRules = { cardId };
export const trelloUpdate: ConfigRules = { cardId, title, description };
export const trelloMove: ConfigRules = { cardId, boardId, listId };
export const trelloList: ConfigRules = {
  boardId, limit,
  before: { schema: z.union([z.literal(""), z.string().regex(/^[a-f0-9]{24}$/i)]), message: "Enter a valid Trello continuation card ID." },
  filter: { schema: z.enum(["open", "closed", "all", "visible"]), message: "Choose a valid Trello card filter." },
};
export const trelloFind: ConfigRules = {
  boardId, limit,
  query: { schema: z.string().max(200).refine((value) => !!value.trim()), required: true, message: "Enter a search query of at most 200 characters." },
  searchPagination: { schema: z.enum(["first", "pages"]), message: "Choose a search pagination mode." },
  page: { schema: z.number().int().min(0).max(100), required: true, when: (config) => config.searchPagination === "pages", dependsOn: ["searchPagination"], message: "Enter a page between 0 and 100." },
};

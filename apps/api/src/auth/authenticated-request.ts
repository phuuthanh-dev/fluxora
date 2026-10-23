import type { Request } from "express";
import type { AuthenticatedUser } from "./auth.service";

export type AuthenticatedRequest = Request & {
  currentUser?: AuthenticatedUser;
};

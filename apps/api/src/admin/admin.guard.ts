import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

/** Workspace ownership is intentionally unrelated to instance administration. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().currentUser;
    const adminId = process.env.PLATFORM_ADMIN_USER_ID;
    if (!user || !adminId || adminId !== user.id) {
      throw new ForbiddenException({ code: "ADMIN_REQUIRED", message: "Platform administrator access is required." });
    }
    return true;
  }
}

import { CanActivate, ExecutionContext, Inject, Injectable, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./authenticated-request";
import { AuthService } from "./auth.service";

const SESSION_COOKIE = "workflow_session";

@Injectable()
export class AuthenticationGuard implements CanActivate, OnModuleDestroy {
  private stopping = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.stopping) throw new ServiceUnavailableException("Server is shutting down.");
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sign in is required." });
    }
    const lookup = this.authService.getCurrentUser(token);
    this.pending.add(lookup);
    try {
      request.currentUser = await lookup;
      return true;
    } finally {
      this.pending.delete(lookup);
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const value = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}

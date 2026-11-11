export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiClientError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;
  constructor(message: string, code?: string, details?: unknown, status?: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

type ApiError = {
  code?: string;
  message?: string;
  details?: unknown;
};

export async function apiRequest<T>(path: string, init?: RequestInit, options?: { silentUnauthorized?: boolean }): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) {
    const error = new ApiClientError(
      typeof body.message === "string" ? body.message : "The request could not be completed.",
      typeof body.code === "string" ? body.code : undefined,
      body.details,
      response.status,
    );
    if (typeof window !== "undefined" && !options?.silentUnauthorized && isUnauthenticated(error)) window.dispatchEvent(new Event("fluxora:unauthenticated"));
    throw error;
  }
  return body;
}

export function isUnauthenticated(reason: unknown): boolean {
  return reason instanceof ApiClientError && (reason.code === "UNAUTHENTICATED" || (reason.status === 401 && !reason.code));
}

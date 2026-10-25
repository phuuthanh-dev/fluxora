export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiClientError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
  }
}

type ApiError = {
  code?: string;
  message?: string;
  details?: unknown;
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) {
    throw new ApiClientError(
      typeof body.message === "string" ? body.message : "The request could not be completed.",
      typeof body.code === "string" ? body.code : undefined,
      body.details,
    );
  }
  return body;
}

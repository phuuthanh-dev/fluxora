import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { CredentialService } from "./credential.service";

export type GitHubRepositoryResource = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string | null;
  permissions: { admin: boolean; push: boolean; pull: boolean } | null;
};

@Injectable()
export class GitHubResourceService {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  async listRepositories(workspaceId: string, credentialId: string, userId: string, page = 1) {
    await this.credentials.requireOwner(workspaceId, userId);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
    const token = typeof credential.token === "string" ? credential.token.trim() : "";
    if (!token) throw new BadRequestException({ code: "GITHUB_CREDENTIAL_INVALID", message: "GitHub credential is missing a token." });

    let response: Response;
    try {
      response = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Fluxora",
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BadRequestException({ code: "GITHUB_RESOURCE_UNAVAILABLE", message: "GitHub repositories could not be loaded right now." });
    }

    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? "GITHUB_CREDENTIAL_INVALID" : "GITHUB_RESOURCE_UNAVAILABLE";
      throw new BadRequestException({ code, message: code === "GITHUB_CREDENTIAL_INVALID" ? "GitHub rejected this connector credential." : "GitHub repositories could not be loaded right now." });
    }

    const payload = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(payload)) throw new BadRequestException({ code: "GITHUB_RESOURCE_INVALID", message: "GitHub returned an invalid repository list." });
    const hasNext = /(?:^|,)\s*<[^>]+>\s*;\s*rel="next"/i.test(response.headers.get("link") ?? "");
    return { repositories: payload.flatMap((item) => normalizeGitHubRepository(item)), nextPage: hasNext && page < 1000 ? page + 1 : null };
  }
}

export function normalizeGitHubRepository(value: unknown): GitHubRepositoryResource[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "number" && Number.isSafeInteger(item.id) ? item.id : null;
  const fullName = typeof item.full_name === "string" ? item.full_name.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const owner = item.owner && typeof item.owner === "object" && !Array.isArray(item.owner) && typeof (item.owner as Record<string, unknown>).login === "string"
    ? ((item.owner as Record<string, unknown>).login as string).trim()
    : fullName.split("/")[0] ?? "";
  if (!id || !fullName || !name || !owner) return [];
  const permissions = item.permissions && typeof item.permissions === "object" && !Array.isArray(item.permissions)
    ? (() => {
      const source = item.permissions as Record<string, unknown>;
      return { admin: source.admin === true, push: source.push === true, pull: source.pull === true };
    })()
    : null;
  return [{
    id,
    fullName,
    name,
    owner,
    private: item.private === true,
    defaultBranch: typeof item.default_branch === "string" && item.default_branch.trim() ? item.default_branch.trim() : null,
    permissions,
  }];
}

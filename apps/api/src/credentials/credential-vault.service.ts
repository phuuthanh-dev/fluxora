import { BadRequestException, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

@Injectable()
export class CredentialVaultService {
  encrypt(value: Record<string, unknown>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  decrypt(value: string): Record<string, unknown> {
    try {
      const payload = Buffer.from(value, "base64");
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", this.key(), iv);
      decipher.setAuthTag(tag);
      const text = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Credential data is not an object.");
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException({ code: "CREDENTIAL_DECRYPT_FAILED", message: "Credential data could not be decrypted." });
    }
  }

  private key() {
    const raw = process.env.APP_ENCRYPTION_KEY;
    if (!raw) throw new BadRequestException({ code: "ENCRYPTION_KEY_REQUIRED", message: "APP_ENCRYPTION_KEY must be configured before saving credentials." });
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new BadRequestException({ code: "ENCRYPTION_KEY_INVALID", message: "APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key." });
    return key;
  }
}

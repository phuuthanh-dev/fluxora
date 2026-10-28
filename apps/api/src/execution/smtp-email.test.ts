import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { isRetryableFailure } from "./retry-policy";
import { executeSmtpEmail } from "./smtp-email";

function mockCredentials(data: Record<string, unknown>): CredentialService {
  return {
    readForExecution: async (_credentialId: string, _workspaceId: string, provider: CredentialProvider) => {
      assert.equal(provider, CredentialProvider.SMTP);
      return data;
    },
  } as unknown as CredentialService;
}

const message = { credentialId: "smtp-1", to: "owner@example.com, team@example.com", cc: "copy@example.com", subject: "Daily report", body: "All systems healthy", bodyFormat: "text" };
const credential = { host: "smtp.example.com", port: 587, username: "mailer", password: "smtp-super-secret", from: "alerts@example.com" };

test("SMTP Email: mock mode provides normalized output without a credential or transport", async () => {
  const result = await executeSmtpEmail({ to: "owner@example.com", subject: "Mock", body: "Message" }, "mock", "workspace-1", mockCredentials({}));
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.output.provider, "smtp");
  assert.equal(result.output.mode, "mock");
  assert.equal(result.output.destination, "1 recipient");
  assert.equal(result.output.messageId, "mock-smtp-message-id");
});

test("SMTP Email: live mode requires TLS submission settings and passes only safe message fields to the adapter", async () => {
  let observed: unknown;
  const result = await executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
    assertSafeHost: async (host) => assert.equal(host, "smtp.example.com"),
    sendMail: async (savedCredential, savedMessage) => {
      observed = { savedCredential, savedMessage };
      return { messageId: "provider-message-id" };
    },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.output.mode, "live");
  assert.equal(result.output.destination, "3 recipients");
  assert.equal(result.output.messageId, "provider-message-id");
  assert.deepEqual(observed, {
    savedCredential: credential,
    savedMessage: {
      to: ["owner@example.com", "team@example.com"],
      cc: ["copy@example.com"],
      bcc: [],
      subject: "Daily report",
      body: "All systems healthy",
      bodyFormat: "text",
    },
  });
});

test("SMTP Email: rejects unsafe or plaintext SMTP configuration without leaking a secret", async () => {
  for (const badCredential of [
    { ...credential, port: 25 },
    { ...credential, host: "127.0.0.1" },
    { ...credential, from: "alerts@example" },
  ]) {
    await assert.rejects(
      () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(badCredential)),
      (error: unknown) => {
        assert.equal((error as { retryable?: unknown }).retryable, false);
        assert.ok(!(error as Error).message.includes("smtp-super-secret"));
        return true;
      },
    );
  }
  await assert.rejects(
    () => executeSmtpEmail({ ...message, to: "owner@example.com\r\nBcc: stolen@example.com" }, "live", "workspace-1", mockCredentials(credential)),
    /valid email address/,
  );
});

test("SMTP Email: maps provider auth, rejection and timeouts without preserving raw provider replies", async () => {
  const cases = [
    { error: Object.assign(new Error("535 password smtp-super-secret"), { code: "EAUTH", responseCode: 535 }), code: "SMTP_AUTH_FAILED", retryable: false },
    { error: Object.assign(new Error("recipient rejected"), { code: "EENVELOPE", responseCode: 550 }), code: "SMTP_REJECTED", retryable: false },
    { error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), code: "TIMEOUT", retryable: true },
    { error: Object.assign(new Error("greylisted"), { responseCode: 451 }), code: "SMTP_TEMPORARY", retryable: true },
  ];
  for (const item of cases) {
    await assert.rejects(
      () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
        assertSafeHost: async () => undefined,
        sendMail: async () => { throw item.error; },
      }),
      (error: unknown) => {
        const failure = error as { code?: unknown; message: string; retryable?: boolean; statusCode?: number };
        assert.equal(failure.code, item.code);
        assert.equal(failure.retryable, item.retryable);
        assert.equal(isRetryableFailure({ code: String(failure.code ?? ""), statusCode: failure.statusCode }), item.retryable);
        assert.ok(!failure.message.includes("smtp-super-secret"));
        return true;
      },
    );
  }
});

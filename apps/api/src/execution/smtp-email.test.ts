import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
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
const recipients = ["owner@example.com", "team@example.com", "copy@example.com"];
const rawReply = "provider-private-reply smtp-super-secret owner@example.com";

function assertFailure(error: unknown, code: string, retryable: boolean, counts?: number[]) {
  assert.ok(error instanceof NodeFailure);
  assert.equal(error.code, code);
  assert.equal(error.retryable, retryable);
  const serialized = `${String(error)} ${JSON.stringify(error)}`;
  for (const sensitive of [...recipients, "blind@example.com", credential.from, credential.password, "provider-private-reply"]) {
    assert.ok(!serialized.includes(sensitive), `Failure must not expose ${sensitive}`);
  }
  if (counts) {
    const [recipientCount, acceptedCount, rejectedCount, unconfirmedCount] = counts;
    assert.ok(error.message.includes(`recipientCount=${recipientCount}, acceptedCount=${acceptedCount}, rejectedCount=${rejectedCount}, unconfirmedCount=${unconfirmedCount}.`));
  }
  return true;
}

async function expectReceiptFailure(receipt: unknown, code: string, counts: number[], config: Record<string, unknown> = message) {
  let submissions = 0;
  await assert.rejects(
    () => executeSmtpEmail(config, "live", "workspace-1", mockCredentials(credential), {
      assertSafeHost: async () => undefined,
      sendMail: async () => { submissions += 1; return receipt; },
    }),
    (error: unknown) => assertFailure(error, code, false, counts),
  );
  assert.equal(submissions, 1);
}

test("SMTP Email: mock mode provides normalized output without a credential or transport", async () => {
  const noCredentials = { readForExecution: async () => assert.fail("Mock mode must not read credentials") } as unknown as CredentialService;
  const result = await executeSmtpEmail({ to: "owner@example.com", subject: "Mock", body: "Message" }, "mock", "workspace-1", noCredentials, {
    assertSafeHost: async () => assert.fail("Mock mode must not resolve hosts"),
    sendMail: async () => assert.fail("Mock mode must not submit email"),
  });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.output.provider, "smtp");
  assert.equal(result.output.mode, "mock");
  assert.equal(result.output.destination, "1 recipient");
  assert.equal(result.output.messageId, "mock-smtp-message-id");
  assert.equal(result.output.delivered, true);
  assert.equal(result.output.submissionStatus, "accepted");
  assert.equal(result.output.acceptedCount, 1);
  assert.equal(result.output.deliveryConfirmed, false);
});

test("SMTP rejects an invalid or unresolved body format before accessing credentials", async () => {
  const noCredentials = { readForExecution: async () => assert.fail("must not read credentials") } as unknown as CredentialService;
  for (const mode of ["mock", "live"] as const) {
    for (const bodyFormat of [undefined, "", "markdown", null]) {
      await assert.rejects(executeSmtpEmail({ ...message, bodyFormat }, mode, "workspace-1", noCredentials), { code: "INVALID_CONFIGURATION", message: "Choose text or HTML for the email body." });
    }
  }
  const { bodyFormat: _format, ...defaultMessage } = message;
  const result = await executeSmtpEmail(defaultMessage, "mock", "workspace-1", noCredentials);
  assert.equal(result.status, "succeeded");
});

test("SMTP Email: success requires all recipients accepted and preserves legacy output", async () => {
  let observed: unknown;
  let submissions = 0;
  const result = await executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
    assertSafeHost: async (host) => assert.equal(host, "smtp.example.com"),
    sendMail: async (savedCredential, savedMessage) => {
      submissions += 1;
      observed = { savedCredential, savedMessage };
      return { messageId: "provider-message-id", accepted: [...recipients].reverse(), rejected: [], response: `250 ${rawReply}` };
    },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.output.mode, "live");
  assert.equal(result.output.destination, "3 recipients");
  assert.equal(result.output.messageId, "provider-message-id");
  assert.equal(result.output.delivered, true);
  assert.equal(result.output.submissionStatus, "accepted");
  assert.equal(result.output.acceptedCount, 3);
  assert.equal(result.output.deliveryConfirmed, false);
  assert.ok(Number.isFinite(Date.parse(result.output.sentAt)));
  assert.equal(submissions, 1);
  for (const privateValue of [...recipients, credential.password, rawReply]) assert.ok(!JSON.stringify(result).includes(privateValue));
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

test("SMTP Email: matches address objects, domain case and IDNs while counting deduplicated envelope recipients", async () => {
  const result = await executeSmtpEmail({
    ...message,
    to: "Owner@EXAMPLE.COM, owner@example.com, international@bücher.example",
    cc: "Owner@example.com",
    bcc: "blind@example.com",
  }, "live", "workspace-1", mockCredentials(credential), {
    assertSafeHost: async () => undefined,
    sendMail: async () => ({
      accepted: [{ name: "ignored display name", address: "Owner@example.com" }, "owner@EXAMPLE.COM", "international@xn--bcher-kva.example", "blind@example.com"],
      rejected: [],
    }),
  });
  assert.equal(result.output.acceptedCount, 4);
  assert.equal(result.output.destination, "5 recipients");
  assert.equal(result.output.deliveryConfirmed, false);
});

test("SMTP Email: a partial receipt fails once with sanitized counts even for a temporary recipient rejection", async () => {
  await expectReceiptFailure({
    messageId: rawReply,
    accepted: recipients.slice(0, 2),
    rejected: [{ address: recipients[2] }],
    rejectedErrors: [{ recipient: recipients[2], responseCode: 451, response: rawReply, message: rawReply }],
    response: `250 ${rawReply}`,
  }, "SMTP_PARTIAL_REJECTION", [3, 2, 1, 0]);
});

const uncertainReceipts: { name: string; receipt: unknown; counts: number[] }[] = [
  { name: "missing result", receipt: undefined, counts: [3, 0, 0, 3] },
  { name: "null result", receipt: null, counts: [3, 0, 0, 3] },
  { name: "primitive result", receipt: rawReply, counts: [3, 0, 0, 3] },
  { name: "message ID without receipt", receipt: { messageId: rawReply }, counts: [3, 0, 0, 3] },
  { name: "missing rejected list", receipt: { accepted: recipients }, counts: [3, 3, 0, 0] },
  { name: "missing accepted list", receipt: { rejected: [] }, counts: [3, 0, 0, 3] },
  { name: "empty lists", receipt: { accepted: [], rejected: [] }, counts: [3, 0, 0, 3] },
  { name: "non-array accepted", receipt: { accepted: recipients.join(","), rejected: [] }, counts: [3, 0, 0, 3] },
  { name: "non-array rejected", receipt: { accepted: recipients, rejected: null }, counts: [3, 3, 0, 0] },
  { name: "malformed address object", receipt: { accepted: [recipients[0], { address: 1 }, null], rejected: [] }, counts: [3, 1, 0, 2] },
  { name: "display-name string", receipt: { accepted: [recipients[0], recipients[1], `Copy <${recipients[2]}>`], rejected: [] }, counts: [3, 2, 0, 1] },
  { name: "same count but different recipient", receipt: { accepted: [recipients[0], recipients[1], "blind@example.com"], rejected: [] }, counts: [3, 2, 0, 1] },
  { name: "local-part case mismatch", receipt: { accepted: ["Owner@example.com", ...recipients.slice(1)], rejected: [] }, counts: [3, 2, 0, 1] },
  { name: "duplicate hiding a missing recipient", receipt: { accepted: [recipients[0], recipients[0], recipients[1]], rejected: [] }, counts: [3, 2, 0, 1] },
  { name: "duplicate in an otherwise complete receipt", receipt: { accepted: [...recipients, recipients[0]], rejected: [] }, counts: [3, 3, 0, 0] },
  { name: "overlapping accepted and rejected", receipt: { accepted: recipients, rejected: [recipients[0]] }, counts: [3, 2, 0, 1] },
  { name: "unaccounted recipient", receipt: { accepted: [recipients[0]], rejected: [recipients[1]] }, counts: [3, 1, 1, 1] },
  { name: "no acceptance despite resolved send", receipt: { accepted: [], rejected: recipients }, counts: [3, 0, 3, 0] },
  { name: "pending recipients contradict acceptance", receipt: { accepted: recipients, rejected: [], pending: [recipients[0]] }, counts: [3, 3, 0, 0] },
  { name: "rejection errors contradict acceptance", receipt: { accepted: recipients, rejected: [], rejectedErrors: [{ recipient: recipients[0], response: rawReply }] }, counts: [3, 3, 0, 0] },
  { name: "rejection error names a different recipient", receipt: { accepted: recipients.slice(0, 2), rejected: [recipients[2]], rejectedErrors: [{ recipient: recipients[0] }] }, counts: [3, 2, 1, 0] },
];

for (const item of uncertainReceipts) {
  test(`SMTP Email: ${item.name} is nonretryable delivery uncertainty`, async () => {
    await expectReceiptFailure(item.receipt, "DELIVERY_UNCERTAIN", item.counts);
  });
}

test("SMTP Email: Bcc acceptance is required and Reply-To is not a recipient", async () => {
  const config = { ...message, bcc: "blind@example.com", replyTo: "reply@example.com" };
  await expectReceiptFailure({ accepted: recipients, rejected: [] }, "DELIVERY_UNCERTAIN", [4, 3, 0, 1], config);
  const result = await executeSmtpEmail(config, "live", "workspace-1", mockCredentials(credential), {
    assertSafeHost: async () => undefined,
    sendMail: async () => ({ accepted: [...recipients, "blind@example.com"], rejected: [] }),
  });
  assert.equal(result.output.acceptedCount, 4);
});

test("SMTP Email: real transport configuration retains verified TLS and closes after either outcome", async (t) => {
  const options: unknown[] = [];
  const submitted: unknown[] = [];
  let closes = 0;
  let failSend = false;
  t.mock.method(nodemailer, "createTransport", (config: unknown) => {
    options.push(config);
    return {
      sendMail: async (mail: unknown) => {
        submitted.push(mail);
        if (failSend) throw Object.assign(new Error(rawReply), { code: "ESOCKET" });
        return { accepted: recipients, rejected: [] };
      },
      close: () => { closes += 1; },
    } as unknown as ReturnType<typeof nodemailer.createTransport>;
  });
  for (const port of [465, 587]) {
    await executeSmtpEmail({ ...message, bodyFormat: "html", replyTo: "reply@example.com" }, "live", "workspace-1", mockCredentials({ ...credential, port }), {
      assertSafeHost: async () => undefined,
    });
    assert.deepEqual(options.at(-1), {
      host: credential.host, port, secure: port === 465, requireTLS: port === 587,
      auth: { user: credential.username, pass: credential.password },
      connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 30_000,
      tls: { servername: credential.host, minVersion: "TLSv1.2", rejectUnauthorized: true },
      logger: false, debug: false,
    });
    assert.deepEqual(submitted.at(-1), {
      from: credential.from, to: recipients.slice(0, 2), cc: [recipients[2]],
      subject: message.subject, html: message.body, replyTo: "reply@example.com",
    });
  }
  failSend = true;
  await assert.rejects(
    () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), { assertSafeHost: async () => undefined }),
    (error: unknown) => assertFailure(error, "DELIVERY_UNCERTAIN", false, [3, 0, 0, 3]),
  );
  assert.equal(submitted.length, 3);
  assert.equal(closes, 3);
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

test("SMTP Email: keeps input limits and prevents transport before valid configuration and safe host", async () => {
  let submissions = 0;
  const dependencies = {
    assertSafeHost: async () => undefined,
    sendMail: async () => { submissions += 1; return { accepted: recipients, rejected: [] }; },
  };
  for (const config of [
    { ...message, subject: "s".repeat(251) },
    { ...message, body: "b".repeat(200_001) },
    ...["to", "cc", "bcc"].map((field) => ({ ...message, [field]: Array.from({ length: 26 }, (_, i) => `person${i}@example.com`).join(",") })),
  ]) {
    await assert.rejects(
      () => executeSmtpEmail(config, "live", "workspace-1", mockCredentials(credential), dependencies),
      (error: unknown) => assertFailure(error, "INVALID_CONFIGURATION", false),
    );
  }
  await assert.rejects(
    () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
      ...dependencies,
      assertSafeHost: async () => { throw new NodeFailure("OUTBOUND_HOST_BLOCKED", "Blocked SMTP host.", false); },
    }),
    (error: unknown) => assertFailure(error, "OUTBOUND_HOST_BLOCKED", false),
  );
  assert.equal(submissions, 0);
});

test("SMTP Email: preserves auth and permanent rejection while retrying only confirmed temporary pre-DATA rejections", async () => {
  const cases = [
    { attributes: { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" }, code: "SMTP_AUTH_FAILED", retryable: false },
    { attributes: { code: "EAUTH", responseCode: 454, command: "AUTH LOGIN" }, code: "SMTP_AUTH_FAILED", retryable: false },
    { attributes: { code: "EENVELOPE", responseCode: 550 }, code: "SMTP_REJECTED", retryable: false },
    { attributes: { code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }, code: "SMTP_REJECTED", retryable: false },
    { attributes: { code: "EENVELOPE", responseCode: 451, command: "RCPT TO" }, code: "SMTP_TEMPORARY", retryable: true },
    { attributes: { code: "EENVELOPE", responseCode: 450, command: "MAIL FROM" }, code: "SMTP_TEMPORARY", retryable: true },
    { attributes: { code: "EPROTOCOL", responseCode: 421, command: "EHLO" }, code: "SMTP_TEMPORARY", retryable: true },
  ];
  for (const item of cases) {
    let submissions = 0;
    await assert.rejects(
      () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
        assertSafeHost: async () => undefined,
        sendMail: async () => {
          submissions += 1;
          throw Object.assign(new Error(rawReply), item.attributes, { response: rawReply });
        },
      }),
      (error: unknown) => {
        assertFailure(error, item.code, item.retryable);
        assert.ok(error instanceof NodeFailure);
        assert.equal(error.statusCode, item.attributes.responseCode);
        return true;
      },
    );
    assert.equal(submissions, 1);
  }
});

test("SMTP Email: timeouts, disconnects and ambiguous DATA outcomes never permit automatic resubmission", async () => {
  for (const attributes of [
    { code: "ETIMEDOUT" },
    { name: "TimeoutError" },
    { name: "AbortError" },
    { code: "ECONNRESET" },
    { code: "EPIPE", command: "DATA" },
    { code: "ESOCKET", command: "CONN" },
    { code: "ECONNECTION", command: "CONN", responseCode: 421 },
    { code: "ENETUNREACH", command: "RCPT TO", responseCode: 451 },
    { code: "ETIMEDOUT", command: "RCPT TO", responseCode: 451 },
    { code: "EENVELOPE", command: "RCPT TO", responseCode: 451, accepted: [recipients[0]], rejected: recipients.slice(1) },
    { code: "EENVELOPE", command: "DATA", responseCode: 451 },
    { code: "EMESSAGE", command: "DATA", responseCode: 554 },
    { code: "EMESSAGE", command: "DATA", responseCode: 451 },
    { code: "EPROTOCOL", command: "QUIT", responseCode: 421 },
    { responseCode: 451 },
    { responseCode: 550 },
    { command: "MAIL FROM", responseCode: "451" },
    { command: "RCPT TO", responseCode: 451.5 },
    { command: "RCPT TO", responseCode: 250 },
    {},
  ]) {
    let submissions = 0;
    await assert.rejects(
      () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
        assertSafeHost: async () => undefined,
        sendMail: async () => {
          submissions += 1;
          throw Object.assign(new Error(rawReply), attributes, { response: rawReply });
        },
      }),
      (error: unknown) => assertFailure(error, "DELIVERY_UNCERTAIN", false, [3, 0, 0, 3]),
    );
    assert.equal(submissions, 1);
  }
});

test("SMTP Email: a transport's generic retryable failure is sanitized and made uncertain after sendMail starts", async () => {
  await assert.rejects(
    () => executeSmtpEmail(message, "live", "workspace-1", mockCredentials(credential), {
      assertSafeHost: async () => undefined,
      sendMail: async () => { throw new NodeFailure("NETWORK_ERROR", rawReply, true, 503); },
    }),
    (error: unknown) => assertFailure(error, "DELIVERY_UNCERTAIN", false, [3, 0, 0, 3]),
  );
});

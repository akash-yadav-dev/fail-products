// src/integrations/zeptomail/send-email.ts
/**
 * ZeptoMail transactional email.
 *
 * Endpoint, auth header, and body shape verified against Zoho's own
 * documentation on 2026-08-31:
 * https://www.zoho.com/zeptomail/help/api/email-sending.html
 *
 * A thin adapter: it speaks HTTP and nothing else. No retries, no queue, no
 * template rendering — the message is composed by the caller
 * (`src/integrations/zeptomail/messages.ts`) so a provider swap never touches
 * the wording of an email.
 *
 * ZeptoMail is **transactional only** (docs/ENGINEERING.md §9). Marketing mail
 * is a different product with different consent obligations.
 *
 * No SDK: this is one `fetch` call, and a dependency to wrap it would fail
 * gate 1 of the dependency checklist.
 */

const ENDPOINT = "https://api.zeptomail.com/v1.1/email";

export type EmailAddress = {
  address: string;
  name?: string;
};

/**
 * Every message carries a text fallback as well as HTML
 * (docs/ENGINEERING.md §9). A client that will not render HTML still has to be
 * able to act on a sign-in link.
 */
export type TransactionalMessage = {
  to: EmailAddress;
  subject: string;
  html: string;
  text: string;
  /** Our own correlation id, echoed back in ZeptoMail's reporting. */
  reference?: string;
};

export type SendEmailOptions = {
  token: string;
  from: EmailAddress;
  /** Injected so the adapter is testable without a network. */
  fetchImpl?: typeof fetch;
};

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: string; retryable: boolean };

function assertHeaderValue(value: string | undefined, field: string): void {
  if (value && /[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field}: line breaks are not allowed.`);
  }
}

/**
 * Send one message.
 *
 * Returns a result instead of throwing, because of the rule that matters most
 * here: **never block the main request on non-critical delivery**
 * (docs/ENGINEERING.md §9). A caller that must not fail on a bounced provider
 * can log the result and carry on; a caller that genuinely depends on delivery
 * — a sign-in link — checks `ok` and says so to the user.
 */
export async function sendTransactionalEmail(
  message: TransactionalMessage,
  { token, from, fetchImpl = fetch }: SendEmailOptions
): Promise<SendEmailResult> {
  if (!token) {
    throw new Error("ZEPTOMAIL_TOKEN is not set. See .env.example.");
  }

  if (!from.address) {
    throw new Error("ZEPTOMAIL_FROM_ADDRESS is not set. See .env.example.");
  }

  // These values are serialized into a provider request and may become mail
  // headers. Reject CR/LF before user-controlled display names or subjects
  // can reach the adapter.
  assertHeaderValue(message.subject, "subject");
  assertHeaderValue(message.to.name, "recipient name");
  assertHeaderValue(from.name, "sender name");

  let response: Response;

  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        // Zoho's documented scheme. Not "Bearer".
        Authorization: ["Zoho-enczapikey", token].join(" "),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: { address: from.address, name: from.name },
        to: [
          {
            email_address: {
              address: message.to.address,
              name: message.to.name,
            },
          },
        ],
        subject: message.subject,
        htmlbody: message.html,
        textbody: message.text,
        client_reference: message.reference,
        // Transactional mail: opening a sign-in email is not a signal we want,
        // and a tracking pixel in one is a privacy cost with no return.
        track_opens: false,
        track_clicks: false,
      }),
    });
  } catch {
    // The thrown error can carry the request, and the request carries the API
    // key. Never propagate it.
    return { ok: false, reason: "transport-failure", retryable: true };
  }

  if (response.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `zeptomail-http-${response.status}`,
    // 4xx is our fault and will fail again identically; 5xx and 429 may not.
    retryable: response.status >= 500 || response.status === 429,
  };
}

export { ENDPOINT as ZEPTOMAIL_ENDPOINT };

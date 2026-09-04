// src/services/waitlist/email-delivery.ts
import { sendTransactionalEmail } from "@/integrations/zeptomail/send-email";
import { zeptoMailConfig } from "@/lib/config/email";
import { siteConfig } from "@/lib/config/site";
import type { WaitlistConfirmationMessage } from "@/services/waitlist/waitlist-service";

/**
 * The waitlist confirmation email.
 *
 * Composed here rather than in the adapter, so a provider swap never touches
 * the wording — the same split `services/auth/email-delivery.ts` uses.
 *
 * **Transactional, and it has to stay that way.** ZeptoMail is transactional
 * only (`docs/ENGINEERING.md` §9), and this message qualifies for one reason:
 * it is the direct, expected response to something the recipient just did. The
 * moment this template starts carrying product news it becomes marketing mail
 * with different consent obligations, and it must not.
 *
 * It carries **two** links, and the second is not optional. `docs/LEGAL.md` §5
 * says a waitlist entry is erased on request by the subscriber, and a removal
 * route nobody is told about is not a route anybody can use. It is also the
 * only recourse for somebody whose address was entered by a stranger — which is
 * precisely the case double opt-in exists for (ADR-029).
 */

export function waitlistConfirmationUrl(token: string): string {
  const url = new URL("/waitlist/confirm", siteConfig.url);
  url.searchParams.set("token", token);
  return url.toString();
}

export function waitlistUnsubscribeUrl(token: string): string {
  const url = new URL("/waitlist/unsubscribe", siteConfig.url);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Sends the confirmation.
 *
 * Throws on a delivery failure. That is safe here **only** because of how it is
 * called: `joinWaitlist` hands it to a dispatcher that runs after the response
 * (`after()` in the server binding), so a throw lands on nobody's request. A
 * future caller that awaits this directly would be blocking a visitor on a
 * third party, which `docs/ENGINEERING.md` §9 forbids.
 */
export async function sendWaitlistConfirmation(
  message: WaitlistConfirmationMessage
): Promise<void> {
  const config = zeptoMailConfig();

  const confirmUrl = waitlistConfirmationUrl(message.token);
  const removeUrl = waitlistUnsubscribeUrl(message.token);

  // The product's name is owner-supplied text reaching a mail header. The
  // adapter rejects CR/LF in a subject, which is the header-injection case;
  // everything else is body text and is escaped below.
  const subject = `Confirm your place on the ${message.productName} waitlist`;
  const name = escapeHtml(message.productName);

  const sent = await sendTransactionalEmail(
    {
      to: { address: message.email },
      subject,
      text: [
        `Somebody entered this address on the ${message.productName} waitlist on FailProducts.`,
        "",
        `Confirm it and you will hear from the founder if the product comes back:`,
        confirmUrl,
        "",
        "If that was not you, ignore this email — nothing is sent to an address that is never confirmed.",
        `You can also remove this address now: ${removeUrl}`,
      ].join("\n"),
      html: [
        `<p>Somebody entered this address on the <strong>${name}</strong> waitlist on FailProducts.</p>`,
        `<p><a href="${confirmUrl}">Confirm your place on the waitlist</a></p>`,
        `<p>If that was not you, ignore this email — nothing is sent to an address that is never confirmed. You can also <a href="${removeUrl}">remove this address now</a>.</p>`,
      ].join(""),
    },
    {
      token: config.token,
      from: { address: config.fromAddress, name: "FailProducts" },
    }
  );

  if (!sent.ok) throw new Error("waitlist confirmation delivery failed");
}

/**
 * Escapes the one piece of user-controlled text in the HTML body.
 *
 * A product name is written by its owner and this is an HTML document being
 * sent to a third party. Mail clients render HTML; `docs/SECURITY.md` §5 does
 * not stop applying because the document leaves in an email.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

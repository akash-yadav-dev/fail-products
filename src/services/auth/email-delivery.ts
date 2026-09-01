import { sendTransactionalEmail } from "@/integrations/zeptomail/send-email";
import { zeptoMailConfig } from "@/lib/config/email";

export async function sendSignInCode(input: { email: string; code: string }): Promise<void> {
  const config = zeptoMailConfig();
  const sent = await sendTransactionalEmail(
    {
      to: { address: input.email },
      subject: "Your FailProducts sign-in code",
      text: `Your one-time FailProducts sign-in code is ${input.code}. It expires in 10 minutes.`,
      html: `<p>Your one-time FailProducts sign-in code is <strong>${input.code}</strong>. It expires in 10 minutes.</p>`,
    },
    { token: config.token, from: { address: config.fromAddress, name: "FailProducts" } }
  );
  if (!sent.ok) throw new Error("email delivery failed");
}

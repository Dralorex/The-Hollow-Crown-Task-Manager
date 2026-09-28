export function getAppBaseUrl() {
  const explicit = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export function getEmailFrom() {
  return process.env.EMAIL_FROM?.trim() || "Rowgon <onboarding@resend.dev>";
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends via Resend HTTP API when RESEND_API_KEY is set.
 * Without a key, logs the message (local/dev) and returns mocked: true.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<{ ok: true; mocked: boolean } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[rowgon:mail:dev]", {
      to: input.to,
      subject: input.subject,
      text: input.text.slice(0, 500),
    });
    return { ok: true, mocked: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getEmailFrom(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body || `Resend HTTP ${res.status}` };
    }
    return { ok: true, mocked: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Mail send failed.",
    };
  }
}

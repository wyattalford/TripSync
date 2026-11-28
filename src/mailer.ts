// Sends email through a free provider chosen by environment settings. No provider SDKs: plain HTTPS
// so it works even where outgoing SMTP ports are blocked.
//
//   EMAIL_PROVIDER   resend | brevo | console   (console prints emails instead of sending; the default)
//   EMAIL_API_KEY    the provider's API key (never logged)
//   EMAIL_FROM       sender address (Resend without a verified domain: onboarding@resend.dev)
//   EMAIL_FROM_NAME  sender display name, e.g. OpenTime

export type Email = { to: string; subject: string; text: string; html: string };
export type Mailer = (email: Email) => Promise<void>;
type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class EmailNotConfigured extends Error {}
export class EmailRejected extends Error {}

export function createMailer(env: Env = process.env, fetchImpl: FetchLike = (input, init) => fetch(input, init)): Mailer {
  const provider = (env.EMAIL_PROVIDER ?? "console").toLowerCase();
  const key = env.EMAIL_API_KEY ?? "";
  const from = env.EMAIL_FROM ?? "";
  const name = env.EMAIL_FROM_NAME || "OpenTime";

  if (provider === "console") {
    return async (email) => {
      console.log(`[email] to ${email.to}: ${email.subject}\n${email.text}`);
    };
  }
  if (provider !== "resend" && provider !== "brevo") throw new EmailNotConfigured(`Unknown EMAIL_PROVIDER "${provider}".`);
  if (!key || !from) throw new EmailNotConfigured("EMAIL_API_KEY and EMAIL_FROM are required to send email.");

  return async (email) => {
    const response = provider === "resend"
      ? await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `${name} <${from}>`, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      })
      : await fetchImpl("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { name, email: from }, to: [{ email: email.to }], subject: email.subject, textContent: email.text, htmlContent: email.html }),
      });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new EmailRejected(`${provider} refused the email (HTTP ${response.status}): ${detail}`);
    }
  };
}

/** Escapes text for safe inclusion in an HTML email. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** A small, consistent HTML layout for OpenTime emails (teal heading, plain body, optional button). */
export function emailLayout({ heading, lines, action }: { heading: string; lines: string[]; action?: { label: string; url: string } }): string {
  const body = lines.map((line) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(line)}</p>`).join("");
  const button = action
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#0d6055;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#172f35;max-width:520px;margin:0 auto;padding:24px">`
    + `<p style="margin:0 0 16px;color:#0d6055;font-size:18px;font-weight:800">OpenTime</p>`
    + `<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>${body}${button}</div>`;
}

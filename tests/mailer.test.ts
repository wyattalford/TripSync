import { describe, expect, spyOn, test } from "bun:test";
import { EmailNotConfigured, EmailRejected, createMailer, emailLayout, escapeHtml } from "../src/mailer.ts";

const email = { to: "walker@example.com", subject: "Reminder", text: "Film night", html: "<p>Film night</p>" };

function recorder(status = 200, body = "{}") {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(body, { status }); };
  return { calls, fetchImpl };
}

describe("mailer", () => {
  test("console is the default and prints instead of sending", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await createMailer({})(email);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]![0])).toContain("walker@example.com");
    } finally { log.mockRestore(); }
  });

  test("Resend: posts JSON with a bearer key and a named sender", async () => {
    const { calls, fetchImpl } = recorder();
    await createMailer({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_test", EMAIL_FROM: "onboarding@resend.dev", EMAIL_FROM_NAME: "OpenTime" }, fetchImpl)(email);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: "OpenTime <onboarding@resend.dev>", to: ["walker@example.com"], subject: "Reminder", text: "Film night", html: "<p>Film night</p>",
    });
  });

  test("Brevo: posts JSON with an api-key header", async () => {
    const { calls, fetchImpl } = recorder(201);
    await createMailer({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: "xkeysib-test", EMAIL_FROM: "team@example.com" }, fetchImpl)(email);
    expect(calls[0]!.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((calls[0]!.init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      sender: { name: "OpenTime", email: "team@example.com" }, to: [{ email: "walker@example.com" }],
      subject: "Reminder", textContent: "Film night", htmlContent: "<p>Film night</p>",
    });
  });

  test("a provider refusal throws with the status but never the API key", async () => {
    const { fetchImpl } = recorder(403, "You can only send testing emails to your own email address");
    const send = createMailer({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_secret_key", EMAIL_FROM: "onboarding@resend.dev" }, fetchImpl);
    const error = await send(email).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EmailRejected);
    expect((error as Error).message).toContain("403");
    expect((error as Error).message).toContain("own email address");
    expect((error as Error).message).not.toContain("re_secret_key");
  });

  test("missing or unknown configuration is reported clearly", () => {
    expect(() => createMailer({ EMAIL_PROVIDER: "resend" })).toThrow(EmailNotConfigured);
    expect(() => createMailer({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k" })).toThrow(EmailNotConfigured);
    expect(() => createMailer({ EMAIL_PROVIDER: "pigeon", EMAIL_API_KEY: "k", EMAIL_FROM: "a@b.c" })).toThrow(EmailNotConfigured);
  });

  test("HTML emails escape user-provided text", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
    const html = emailLayout({ heading: "<b>Film</b>", lines: ["Lounge & snacks"], action: { label: "View", url: "https://x.test/?a=1&b=2" } });
    expect(html).toContain("&lt;b&gt;Film&lt;/b&gt;");
    expect(html).toContain("Lounge &amp; snacks");
    expect(html).toContain("https://x.test/?a=1&amp;b=2");
    expect(html).not.toContain("<b>Film</b>");
  });
});

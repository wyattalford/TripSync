import { describe, expect, test } from "bun:test";
import { MIN_PASSWORD_LENGTH, authFailure, validateAuthForm } from "../../frontend/src/authForm.ts";
import { createSessionAwareFetch, endsSession, onSessionEnded } from "../../frontend/src/session.ts";

const valid = { username: "john", password: "safe password", confirm: "safe password" };

describe("sign-in and registration form", () => {
  test("accepts complete sign-in and registration forms", () => {
    expect(validateAuthForm("sign-in", { ...valid, confirm: "" })).toEqual({});
    expect(validateAuthForm("register", valid)).toEqual({});
    expect(validateAuthForm("register", { username: "  John ", password: "12345678", confirm: "12345678" })).toEqual({});
  });

  test("requires a username in both modes", () => {
    for (const mode of ["sign-in", "register"] as const) {
      expect(validateAuthForm(mode, { ...valid, username: "" }).username).toBe("Enter a username.");
      expect(validateAuthForm(mode, { ...valid, username: "   " }).username).toBe("Enter a username.");
    }
  });

  test("sign-in only requires some password, so existing accounts are not locked out by the length rule", () => {
    expect(validateAuthForm("sign-in", { ...valid, password: "" }).password).toBe("Enter your password.");
    expect(validateAuthForm("sign-in", { ...valid, password: "short" })).toEqual({});
  });

  test("registration enforces the same password rule as the server", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(validateAuthForm("register", { ...valid, password: "", confirm: "" }).password).toBe("Enter a password.");
    expect(validateAuthForm("register", { ...valid, password: "        ", confirm: "        " }).password).toBe("Enter a password.");
    expect(validateAuthForm("register", { ...valid, password: "1234567", confirm: "1234567" }).password).toBe("Use at least 8 characters.");
    expect(validateAuthForm("register", { ...valid, password: "12345678", confirm: "12345678" })).toEqual({});
  });

  test("registration requires matching passwords, reported only once the password itself is valid", () => {
    expect(validateAuthForm("register", { ...valid, confirm: "safe passwore" }).confirm).toBe("The passwords do not match.");
    expect(validateAuthForm("register", { ...valid, confirm: "" }).confirm).toBe("The passwords do not match.");
    expect(validateAuthForm("register", { ...valid, password: "short", confirm: "other" })).toEqual({ password: "Use at least 8 characters." });
  });

  test("reports every problem at once", () => {
    expect(validateAuthForm("register", { username: "", password: "short", confirm: "" })).toEqual({
      username: "Enter a username.", password: "Use at least 8 characters.",
    });
  });

  test("explains server refusals without revealing which part of a sign-in was wrong", () => {
    expect(authFailure("register", "CONFLICT")).toEqual({
      field: "username", message: "That username is already taken. Choose another, or sign in instead.",
    });
    expect(authFailure("sign-in", "INVALID_REQUEST")).toEqual({ message: "The username or password is incorrect." });
    expect(authFailure("register", "INVALID_REQUEST").message).toContain("at least 8 characters");
    expect(authFailure("sign-in", "NETWORK_ERROR").message).toContain("could not reach the server");
    expect(authFailure("sign-in", "INTERNAL_ERROR").message).toBe("OpenTime could not complete that request. Try again.");
  });
});

describe("session expiry detection", () => {
  test("treats a 401 from a protected endpoint as a lost session", () => {
    expect(endsSession("/api/groups/list", 401)).toBe(true);
    expect(endsSession("http://127.0.0.1:5173/api/notices/list", 401)).toBe(true);
    expect(endsSession("/api/auth/sign-out", 401)).toBe(true);
  });

  test("ignores signed-out answers and other statuses", () => {
    for (const path of ["/api/auth/current", "/api/auth/sign-in", "/api/auth/register"]) {
      expect(endsSession(path, 401)).toBe(false);
    }
    for (const status of [200, 400, 403, 404, 409, 500]) expect(endsSession("/api/groups/list", status)).toBe(false);
  });

  test("notifies listeners once per lost-session response and stops after unsubscribing", async () => {
    const statuses: Record<string, number> = { "/api/groups/list": 401, "/api/openings/mine": 200, "/api/auth/current": 401 };
    const fetchStub = async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://127.0.0.1:5173").pathname;
      return new Response("{}", { status: statuses[path] ?? 200 });
    };
    const sessionFetch = createSessionAwareFetch(fetchStub);
    let ended = 0;
    const stop = onSessionEnded(() => { ended += 1; });
    try {
      expect((await sessionFetch("/api/openings/mine")).status).toBe(200);
      expect((await sessionFetch("/api/auth/current")).status).toBe(401);
      expect(ended).toBe(0);
      const response = await sessionFetch("/api/groups/list");
      expect(response.status).toBe(401);
      expect(ended).toBe(1);
      await sessionFetch(new Request("http://127.0.0.1:5173/api/groups/list"));
      expect(ended).toBe(2);
    } finally {
      stop();
    }
    await sessionFetch("/api/groups/list");
    expect(ended).toBe(2);
  });
});

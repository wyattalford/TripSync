import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const policy = httpPolicy({
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173",
  basePath: "/api",
  publicErrors: {
    INVALID_CREDENTIALS: "INVALID_REQUEST",
    USERNAME_TAKEN: "CONFLICT",
    UNKNOWN_SESSION: "UNAUTHORIZED",
  },
  cookies: {
    session: {
      name: "opentime-session",
      input: "session",
      issue: [{ path: "/auth/sign-in", value: "session", expires: "expiresAt" }],
      clear: ["/auth/sign-out"],
    },
  },
});

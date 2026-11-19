import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const policy = httpPolicy({
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173",
  basePath: "/api",
  publicErrors: {
    INVALID_CREDENTIALS: "INVALID_REQUEST",
    USERNAME_TAKEN: "CONFLICT",
    UNKNOWN_SESSION: "UNAUTHORIZED",
    INVALID_GROUP: "INVALID_REQUEST",
    GROUP_FORBIDDEN: "FORBIDDEN",
    MEMBERSHIP_CONFLICT: "CONFLICT",
    GROUP_NOT_FOUND: "NOT_FOUND",
    INVALID_OPENING: "INVALID_REQUEST",
    OPENING_CONFLICT: "CONFLICT",
    OPENING_FORBIDDEN: "FORBIDDEN",
    INVALID_GATHERING: "INVALID_REQUEST",
    GATHERING_CONFLICT: "CONFLICT",
    STALE_GATHERING: "CONFLICT",
    GATHERING_FORBIDDEN: "FORBIDDEN",
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

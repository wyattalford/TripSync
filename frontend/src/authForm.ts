// Pure validation and error wording for the sign-in / registration form.
// Mirrors the Authenticating concept's rules so most mistakes are caught before a request.

export const MIN_PASSWORD_LENGTH = 8;

export type AuthMode = "sign-in" | "register";
export type AuthField = "username" | "password" | "confirm";
export type AuthFields = { username: string; password: string; confirm: string };
export type FieldErrors = Partial<Record<AuthField, string>>;
export type AuthFailure = { field?: AuthField; message: string };

export function validateAuthForm(mode: AuthMode, fields: AuthFields): FieldErrors {
  const errors: FieldErrors = {};
  if (!fields.username.trim()) errors.username = "Enter a username.";
  if (mode === "sign-in") {
    if (!fields.password) errors.password = "Enter your password.";
    return errors;
  }
  if (!fields.password.trim()) errors.password = "Enter a password.";
  else if (fields.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!errors.password && fields.confirm !== fields.password) errors.confirm = "The passwords do not match.";
  return errors;
}

/** Translates a public API error code from the step that failed into a message for the person. */
export function authFailure(step: AuthMode, error: string): AuthFailure {
  if (error === "CONFLICT") {
    return { field: "username", message: "That username is already taken. Choose another, or sign in instead." };
  }
  if (error === "INVALID_REQUEST" && step === "sign-in") {
    return { message: "The username or password is incorrect." };
  }
  if (error === "INVALID_REQUEST") {
    return { message: `Enter a username and a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (error === "NETWORK_ERROR") return { message: "OpenTime could not reach the server. Check your connection and try again." };
  return { message: "OpenTime could not complete that request. Try again." };
}

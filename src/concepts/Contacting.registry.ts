import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Contacting.md" with { type: "text" };
import { CodeCooldown, CodeExpired, ContactingConcept, InvalidCode, InvalidEmail } from "./Contacting.ts";

export const contacting = registerConcept({
  class: ContactingConcept, spec,
  refusals: { INVALID_EMAIL: InvalidEmail, CODE_COOLDOWN: CodeCooldown, CODE_EXPIRED: CodeExpired, INVALID_CODE: InvalidCode },
});

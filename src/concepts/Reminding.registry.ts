import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Reminding.md" with { type: "text" };
import { InvalidReminder, RemindingConcept } from "./Reminding.ts";

export const reminding = registerConcept({ class: RemindingConcept, spec, refusals: { INVALID_REMINDER: InvalidReminder } });

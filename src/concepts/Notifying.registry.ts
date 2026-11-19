import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Notifying.md" with { type: "text" };
import { InvalidNotice, NoticeForbidden, NotifyingConcept } from "./Notifying.ts";

export const notifying = registerConcept({ class: NotifyingConcept, spec,
  refusals: { INVALID_NOTICE: InvalidNotice, NOTICE_FORBIDDEN: NoticeForbidden } });

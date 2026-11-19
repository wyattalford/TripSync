import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Gathering.md" with { type: "text" };
import { GatheringConcept, GatheringConflict, GatheringForbidden, InvalidGathering, StaleGathering } from "./Gathering.ts";

export const gathering = registerConcept({
  class: GatheringConcept, spec,
  refusals: {
    INVALID_GATHERING: InvalidGathering,
    GATHERING_CONFLICT: GatheringConflict,
    STALE_GATHERING: StaleGathering,
    GATHERING_FORBIDDEN: GatheringForbidden,
  },
});

import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/AvailabilitySharing.md" with { type: "text" };
import { AvailabilitySharingConcept, InvalidOpening, OpeningConflict, OpeningForbidden, OpeningNotFound } from "./AvailabilitySharing.ts";

export const availabilitySharing = registerConcept({
  class: AvailabilitySharingConcept,
  spec,
  refusals: {
    INVALID_OPENING: InvalidOpening,
    OPENING_CONFLICT: OpeningConflict,
    OPENING_FORBIDDEN: OpeningForbidden,
    OPENING_NOT_FOUND: OpeningNotFound,
  },
});

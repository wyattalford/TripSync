import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { authenticating } from "./concepts/Authenticating.registry.ts";
import { grouping } from "./concepts/Grouping.registry.ts";
import { availabilitySharing } from "./concepts/AvailabilitySharing.registry.ts";
import { gathering } from "./concepts/Gathering.registry.ts";
import { notifying } from "./concepts/Notifying.registry.ts";
import { contacting } from "./concepts/Contacting.registry.ts";
import { reminding } from "./concepts/Reminding.registry.ts";
import { fullGroupOverlaps } from "./overlap.ts";

export const applicationConceptSet = conceptSet({ Authenticating: authenticating, Grouping: grouping, AvailabilitySharing: availabilitySharing, Gathering: gathering, Notifying: notifying, Contacting: contacting, Reminding: reminding }, { fullGroupOverlaps });
export const { concepts } = applicationConceptSet;
export const { computations } = applicationConceptSet;

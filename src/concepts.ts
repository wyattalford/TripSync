import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { authenticating } from "./concepts/Authenticating.registry.ts";
import { grouping } from "./concepts/Grouping.registry.ts";

export const applicationConceptSet = conceptSet({ Authenticating: authenticating, Grouping: grouping });
export const { concepts } = applicationConceptSet;

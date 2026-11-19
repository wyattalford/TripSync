import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Grouping.md" with { type: "text" };
import { GroupForbidden, GroupingConcept, InvalidGroup, MembershipConflict } from "./Grouping.ts";

export const grouping = registerConcept({
  class: GroupingConcept,
  spec,
  refusals: {
    INVALID_GROUP: InvalidGroup,
    GROUP_FORBIDDEN: GroupForbidden,
    MEMBERSHIP_CONFLICT: MembershipConflict,
  },
});

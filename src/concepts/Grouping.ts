import type { Collection, Db } from "mongodb";

export class InvalidGroup extends Error {}
export class GroupForbidden extends Error {}
export class MembershipConflict extends Error {}

export type MembershipStatus = "PENDING" | "MEMBER" | "DECLINED" | "LEFT" | "REMOVED";
export type GroupStatus = "ACTIVE" | "CLOSED";

type GroupDocument = {
  _id: string;
  owner: string;
  name: string;
  status: GroupStatus;
  url: string;
  memberships: Record<string, MembershipStatus>;
};

function membershipKey(user: string): string {
  return `memberships.${user}`;
}

async function changePending(groups: Collection<GroupDocument>, user: string, group: string, status: MembershipStatus, message: string) {
  const key = membershipKey(user);
  const result = await groups.updateOne(
    { _id: group, status: "ACTIVE", [key]: "PENDING" },
    { $set: { [key]: status } },
  );
  if (!result.modifiedCount) throw new MembershipConflict(message);
  return {};
}

export class GroupingConcept {
  private readonly groups: Collection<GroupDocument>;

  constructor(db: Db) {
    this.groups = db.collection<GroupDocument>("grouping.groups");
  }

  async create({ owner, name }: { owner: string; name: string }) {
    const cleanedName = name.trim();
    if (!cleanedName) throw new InvalidGroup("Enter a group name.");
    await this.groups.createIndex({ url: 1 }, { unique: true });
    const group = crypto.randomUUID();
    await this.groups.insertOne({
      _id: group,
      owner,
      name: cleanedName,
      status: "ACTIVE",
      url: `/join/${crypto.randomUUID()}`,
      memberships: { [owner]: "MEMBER" },
    });
    return { group };
  }

  async invite({ user, group, invitee }: { user: string; group: string; invitee: string }) {
    if (user === invitee) throw new GroupForbidden("Only the owner can invite another account.");
    const key = membershipKey(invitee);
    const result = await this.groups.updateOne(
      { _id: group, owner: user, status: "ACTIVE", $or: [{ [key]: { $exists: false } }, { [key]: { $in: ["DECLINED", "LEFT", "REMOVED"] } }] },
      { $set: { [key]: "PENDING" } },
    );
    if (result.modifiedCount) return {};
    const ownerGroup = await this.groups.findOne({ _id: group, owner: user, status: "ACTIVE" });
    if (!ownerGroup) throw new GroupForbidden("Only the owner can invite another account.");
    throw new MembershipConflict("This account is already invited or a member.");
  }

  async accept({ user, group }: { user: string; group: string }) {
    return changePending(this.groups, user, group, "MEMBER", "There is no active invitation to accept.");
  }

  async decline({ user, group }: { user: string; group: string }) {
    return changePending(this.groups, user, group, "DECLINED", "There is no active invitation to decline.");
  }

  async join({ user, url }: { user: string; url: string }) {
    const key = membershipKey(user);
    const changed = await this.groups.findOneAndUpdate(
      { url, status: "ACTIVE", $or: [{ [key]: { $exists: false } }, { [key]: { $in: ["PENDING", "DECLINED", "LEFT"] } }] },
      { $set: { [key]: "MEMBER" } },
      { returnDocument: "after" },
    );
    if (changed) return { group: changed._id };
    const existing = await this.groups.findOne({ url, status: "ACTIVE" });
    if (existing?.memberships[user] === "REMOVED") {
      throw new GroupForbidden("Ask the owner for a new invitation.");
    }
    throw new MembershipConflict("This link is unavailable or you already belong.");
  }

  async leave({ user, group }: { user: string; group: string }) {
    const key = membershipKey(user);
    const result = await this.groups.updateOne(
      { _id: group, status: "ACTIVE", owner: { $ne: user }, [key]: "MEMBER" },
      { $set: { [key]: "LEFT" } },
    );
    if (!result.modifiedCount) throw new GroupForbidden("You cannot leave this group.");
    return {};
  }

  async remove({ user, group, member }: { user: string; group: string; member: string }) {
    if (user === member) throw new GroupForbidden("You cannot remove this person.");
    const key = membershipKey(member);
    const result = await this.groups.updateOne(
      { _id: group, owner: user, status: "ACTIVE", [key]: { $in: ["PENDING", "MEMBER"] } },
      { $set: { [key]: "REMOVED" } },
    );
    if (!result.modifiedCount) throw new GroupForbidden("You cannot remove this person.");
    return {};
  }

  async close({ user, group }: { user: string; group: string }) {
    const result = await this.groups.updateOne(
      { _id: group, owner: user, status: "ACTIVE" },
      { $set: { status: "CLOSED" } },
    );
    if (!result.modifiedCount) throw new GroupForbidden("Only the owner can close an active group.");
    return {};
  }

  async _getGroup({ group }: { group: string }) {
    const found = await this.groups.findOne({ _id: group });
    if (!found) return [];
    const members = Object.entries(found.memberships).filter(([, status]) => status === "MEMBER").map(([user]) => user);
    return [{ owner: found.owner, name: found.name, status: found.status, members }];
  }

  async _membership({ user, group }: { user: string; group: string }) {
    const found = await this.groups.findOne({ _id: group }, { projection: { memberships: 1 } });
    const status = found?.memberships[user];
    return status ? [{ status }] : [];
  }

  async _groupsFor({ user }: { user: string }) {
    const found = await this.groups.find({ status: "ACTIVE", [membershipKey(user)]: "MEMBER" }, { projection: { _id: 1 } }).toArray();
    return found.map(({ _id }) => ({ group: _id }));
  }

  async _joinUrl({ group }: { group: string }) {
    const found = await this.groups.findOne({ _id: group }, { projection: { url: 1 } });
    return found ? [{ url: found.url }] : [];
  }

  async _visibleFor({ user }: { user: string }) {
    const found = await this.groups.find({ status: "ACTIVE", [membershipKey(user)]: { $in: ["PENDING", "MEMBER"] } }).toArray();
    return { groups: found.map((item) => ({
      group: item._id,
      name: item.name,
      owner: item.owner,
      membership: item.memberships[user]!,
      memberCount: Object.values(item.memberships).filter((status) => status === "MEMBER").length,
    })) };
  }

  async _canShareWith({ user, groups }: { user: string; groups: string[] }) {
    const requested = [...new Set(groups)];
    if (requested.length === 0) return { allowed: true };
    const found = await this.groups.countDocuments({
      _id: { $in: requested }, status: "ACTIVE", [membershipKey(user)]: "MEMBER",
    });
    return { allowed: found === requested.length };
  }

  async _accessFor({ user, group }: { user: string; group: string }) {
    const found = await this.groups.findOne({ _id: group, status: "ACTIVE", [membershipKey(user)]: "MEMBER" });
    if (!found) return { allowed: false, members: [] as string[] };
    return { allowed: true, members: Object.entries(found.memberships)
      .filter(([, status]) => status === "MEMBER").map(([member]) => member) };
  }
}

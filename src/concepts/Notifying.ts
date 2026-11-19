import { MongoServerError, type Collection, type Db } from "mongodb";

export class InvalidNotice extends Error {}
export class NoticeForbidden extends Error {}

type NoticeDocument = {
  _id: string;
  recipient: string;
  sourceKey: string;
  message: string;
  destination: string;
  createdAt: Date;
  readAt?: Date;
};

export class NotifyingConcept {
  private readonly notices: Collection<NoticeDocument>;

  constructor(db: Db, private readonly clock: () => Date = () => new Date()) {
    this.notices = db.collection<NoticeDocument>("notifying.notices");
  }

  async notify({ recipient, sourceKey, message, destination }: { recipient: string; sourceKey: string; message: string; destination: string }) {
    if (!sourceKey.trim() || !message.trim() || !(destination.startsWith("/groups/") || destination.startsWith("/gatherings/"))) {
      throw new InvalidNotice("A notice needs a source, message, and application destination.");
    }
    await this.notices.createIndex({ recipient: 1, sourceKey: 1 }, { unique: true });
    let found;
    try {
      found = await this.notices.findOneAndUpdate(
        { recipient, sourceKey },
        { $setOnInsert: { _id: crypto.randomUUID(), recipient, sourceKey, message, destination, createdAt: this.clock() } },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11_000)) throw error;
      found = await this.notices.findOne({ recipient, sourceKey });
    }
    if (!found) throw new Error("Notice upsert did not return a document.");
    return { notice: found._id };
  }

  async markRead({ user, notice }: { user: string; notice: string }) {
    const changed = await this.notices.updateOne({ _id: notice, recipient: user, readAt: { $exists: false } }, { $set: { readAt: this.clock() } });
    if (!changed.modifiedCount && !(await this.notices.findOne({ _id: notice, recipient: user }))) throw new NoticeForbidden("This notice is not yours.");
    return {};
  }

  async _inbox({ user }: { user: string }) {
    const found = await this.notices.find({ recipient: user }).sort({ createdAt: -1, _id: -1 }).toArray();
    return { notices: found.map((item) => ({ notice: item._id, message: item.message, destination: item.destination,
      createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null })) };
  }
}

import type { ClientSession, Db } from "mongodb";
import { NotifyingConcept } from "./concepts/Notifying.ts";

type NoticeEvent = {
  _id: string;
  recipients: string[];
  message: string;
  destination: string;
  createdAt: Date;
  deliveredAt?: Date;
};

export async function queueNotices(db: Db, session: ClientSession, event: Omit<NoticeEvent, "_id" | "createdAt" | "deliveredAt">) {
  if (!event.recipients.length) return;
  await db.collection<NoticeEvent>("notifying.outbox").insertOne({ _id: crypto.randomUUID(), ...event, createdAt: new Date() }, { session });
}

type NoticeWriter = { notify(input: { recipient: string; sourceKey: string; message: string; destination: string }): Promise<{ notice: string } | { error: string }> };

export async function deliverPendingNotices(db: Db, notifying: NoticeWriter = new NotifyingConcept(db)) {
  const outbox = db.collection<NoticeEvent>("notifying.outbox");
  const pending = await outbox.find({ deliveredAt: { $exists: false } }).sort({ createdAt: 1 }).limit(100).toArray();
  for (const event of pending) {
    try {
      for (const recipient of event.recipients) {
        const result = await notifying.notify({ recipient, sourceKey: event._id, message: event.message, destination: event.destination });
        if ("error" in result) throw new Error(`Notice delivery refused: ${result.error}`);
      }
      await outbox.updateOne({ _id: event._id, deliveredAt: { $exists: false } }, { $set: { deliveredAt: new Date() } });
    } catch (error) { console.error("Notice delivery will retry", error); }
  }
}

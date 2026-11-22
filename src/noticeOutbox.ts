import type { Db } from "mongodb";
import { NotifyingConcept } from "./concepts/Notifying.ts";

export type NoticeEvent = {
  _id: string;
  recipients: string[];
  message: string;
  destination: string;
  createdAt: Date;
};

// Each event is stored in the same document as the change that caused it.
export function noticeEvent(event: Omit<NoticeEvent, "_id" | "createdAt">): NoticeEvent {
  return { _id: crypto.randomUUID(), ...event, createdAt: new Date() };
}

type NoticeWriter = { notify(input: { recipient: string; sourceKey: string; message: string; destination: string }): Promise<{ notice: string } | { error: string }> };
type Source = { _id: string; pendingNotices?: NoticeEvent[] };

export async function deliverPendingNotices(db: Db, notifying: NoticeWriter = new NotifyingConcept(db)) {
  for (const name of ["grouping.groups", "gathering.gatherings"]) {
    const collection = db.collection<Source>(name);
    const sources = await collection.find({ "pendingNotices.0": { $exists: true } }).limit(100).toArray();
    for (const source of sources) for (const event of source.pendingNotices ?? []) {
      try {
        for (const recipient of event.recipients) {
          const result = await notifying.notify({ recipient, sourceKey: event._id, message: event.message, destination: event.destination });
          if ("error" in result) throw new Error(`Notice delivery refused: ${result.error}`);
        }
        await collection.updateOne({ _id: source._id }, { $pull: { pendingNotices: { _id: event._id } } });
      } catch (error) { console.error("Notice delivery will retry", error); }
    }
  }
}

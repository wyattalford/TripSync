import { assemble } from "@mit-sdg/sync-engine/assembly";
import type { Db } from "mongodb";
import { applicationConceptSet } from "./concepts.ts";
import { AuthenticatingConcept } from "./concepts/Authenticating.ts";
import { composition as accounts } from "./compositions/Accounts.ts";
import { db } from "./db.ts";

export function assembleApplication(database: Db = db) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: { Authenticating: new AuthenticatingConcept(database) },
    composition: { OpenTime: { Accounts: accounts } },
    rawFaultReporter: ({ error }) => console.error(error),
  });
}

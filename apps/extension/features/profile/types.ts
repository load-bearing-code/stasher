import type { Performer } from "@stasher/protocol";

export type Resolved = { performer: Performer; via: "created" | "linked" };

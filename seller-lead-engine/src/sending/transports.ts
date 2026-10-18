import type { DeliveryResult, OutgoingMessage } from "../domain/messages.ts";

// How a rendered, gated message leaves the engine. Every transport takes a
// message that has already passed `assertSendable`; none of them checks
// compliance itself, so nothing reaches a transport except through the gate.

/** Delivers one message as a draft (a person sends it) or sends it. */
export interface Transport {
  readonly name: string;
  deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult>;
}

/** Records every message in memory: tests and the offline demo. */
export class MemoryTransport implements Transport {
  readonly name = "memory";
  readonly delivered: { msg: OutgoingMessage; mode: "draft" | "send" }[] = [];

  async deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult> {
    this.delivered.push({ msg, mode });
    const n = this.delivered.length;
    return { messageId: `mem-${n}`, threadId: msg.threadId ?? `thread-${msg.prospectId}`, ...(mode === "draft" ? { draftId: `draft-${n}` } : {}) };
  }
}

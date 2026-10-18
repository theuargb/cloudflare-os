import { WorkerEntrypoint } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";

/** Where a large chat attachment lives: the handle names it, and so the Overseer that holds it. */
export type ChatAttachmentHandleParts = {
  overseerId: string;
  chatId: number;
  fileId: string;
};

/**
 * Encode the opaque handle that the agent's `env.ATTACHMENTS.list()` returns for a large
 * attachment. It carries the Overseer's id because `ChatAttachmentContent` is stateless.
 */
export function makeChatAttachmentHandle(parts: ChatAttachmentHandleParts): string {
  return JSON.stringify([parts.overseerId, parts.chatId, parts.fileId]);
}

/** Decode a handle made by `makeChatAttachmentHandle()`; throws on anything else. */
export function parseChatAttachmentHandle(handle: string): ChatAttachmentHandleParts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(handle);
  } catch {
    throw new Error("Invalid chat attachment handle.");
  }
  if (!Array.isArray(parsed) || parsed.length !== 3 || typeof parsed[0] !== "string" ||
      !Number.isSafeInteger(parsed[1]) || typeof parsed[2] !== "string") {
    throw new Error("Invalid chat attachment handle.");
  }
  return {overseerId: parsed[0], chatId: parsed[1], fileId: parsed[2]};
}

/**
 * Streams a large chat attachment from the Workshop's `CHAT_ATTACHMENT_CONTENT` bucket, so a
 * 100 MB file never sits whole in an isolate. Modules reach it through the `CHAT_ATTACHMENTS`
 * service binding with a `handle` from the agent's `env.ATTACHMENTS.list()`.
 *
 * A handle is a capability, but the Overseer that minted it still checks that the attachment
 * remains committed to that chat, so the handle of a deleted attachment opens nothing.
 */
@validateRpc()
export class ChatAttachmentContent extends WorkerEntrypoint<Cloudflare.Env> {
  /** Open the attachment `request.handle` names. Rejects a handle that names no committed attachment. */
  async open(request: { handle: string }):
      Promise<{ size: number; mime: string; stream: ReadableStream<Uint8Array> }> {
    let {overseerId} = parseChatAttachmentHandle(request.handle);
    let namespace = this.ctx.exports.OverseerDurableObject;
    return await namespace.get(namespace.idFromString(overseerId)).openLargeChatAttachment(request.handle);
  }
}

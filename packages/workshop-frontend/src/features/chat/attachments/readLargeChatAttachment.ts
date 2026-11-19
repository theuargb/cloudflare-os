import type { RpcStub } from "capnweb";
import type { Overseer } from "@gadgets/workshop-shared/api";

/**
 * The bytes of a large (R2) chat attachment, read part by part into one buffer: it exceeds a
 * single RPC message, so `getChatAttachmentContent()` refuses it.
 */
export async function readLargeChatAttachment(
    overseer: RpcStub<Overseer>, chatId: number, id: string): Promise<Uint8Array> {
  const first = await overseer.getChatAttachmentContentPart(chatId, id, 0);
  if (first.size === 0) return new Uint8Array(0);
  const bytes = new Uint8Array(first.size);
  let part = first;
  let offset = 0;
  for (;;) {
    if (part.bytes.byteLength === 0) throw new Error("Attachment download ended early.");
    bytes.set(part.bytes, offset);
    offset += part.bytes.byteLength;
    if (offset >= first.size) return bytes;
    part = await overseer.getChatAttachmentContentPart(chatId, id, offset);
  }
}

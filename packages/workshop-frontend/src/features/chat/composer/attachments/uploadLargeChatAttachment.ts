import type { RpcStub } from "capnweb";
import type { ChatAttachmentHandle, Overseer } from "@gadgets/workshop-shared/api";

/**
 * Uploads a file too large for `Overseer.uploadBlob()` in parts, reading each part from the file
 * only as it is sent so that the whole file is never in memory. A failed upload is discarded on
 * the server before the error is rethrown.
 */
export const uploadLargeChatAttachment = async (
  overseer: RpcStub<Overseer>,
  blob: Blob,
  mimeType: string,
  name: string | undefined,
): Promise<ChatAttachmentHandle> => {
  const { id, partBytes } = await overseer.beginLargeChatAttachmentUpload(
    { mimeType, size: blob.size, name });
  try {
    for (let offset = 0, partNo = 1; offset < blob.size; offset += partBytes, partNo++) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + partBytes).arrayBuffer());
      await overseer.uploadLargeChatAttachmentPart({ id, partNo, bytes });
    }
    return await overseer.completeLargeChatAttachmentUpload(id);
  } catch (error) {
    await overseer.discardLargeChatAttachmentUpload(id).catch(() => {
      // The server also sweeps an upload nobody finishes.
    });
    throw error;
  }
};

import { MAX_LARGE_CHAT_ATTACHMENT_BYTES } from "@gadgets/workshop-shared/api";
import { formatAttachmentSize } from "../../attachmentFormatting";

/**
 * The largest attachment uploaded as a Git blob; mirrors the backend's (chat-attachment-validation.ts).
 * A bigger one is uploaded in parts and kept out of the workspace.
 */
export const MAX_CHAT_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_TOTAL_BYTES = 5 * 1024 * 1024;

export const prepareChatAttachment = async (
  file: File,
): Promise<{ blob: Blob; mimeType: string }> => {
  if (file.size > MAX_LARGE_CHAT_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachments must be ${formatAttachmentSize(MAX_LARGE_CHAT_ATTACHMENT_BYTES)} or smaller.`,
    );
  }
  // The workspace receives the original file, not a resized/re-encoded model input.
  return { blob: file, mimeType: file.type || "application/octet-stream" };
};

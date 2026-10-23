import { useEffect, useRef, useState } from "react";
import type { RpcStub } from "capnweb";
import { MAX_LARGE_CHAT_ATTACHMENT_TOTAL_BYTES } from "@gadgets/workshop-shared/api";
import type { ChatAttachmentHandle, Overseer } from "@gadgets/workshop-shared/api";
import { reportIssue } from "../../../../errorReporting";
import { formatAttachmentSize } from "../../attachmentFormatting";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_TOTAL_BYTES,
  prepareChatAttachment,
} from "./prepareChatAttachment";
import { uploadLargeChatAttachment } from "./uploadLargeChatAttachment";

export const MAX_COMPOSER_ATTACHMENTS = 5;

export type ComposerAttachment = {
  id: string;
  blob: Blob;
  name?: string;
  previewUrl?: string;
  mimeType: string;
  uploadState: "uploading" | "ready" | "error";
  ref?: ChatAttachmentHandle;
  error?: string;
};

type ComposerAttachmentsOptions = {
  getOverseer: () => Promise<RpcStub<Overseer>> | RpcStub<Overseer>;
  onError: (message: string) => void;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const useComposerAttachments = ({
  getOverseer,
  onError,
}: ComposerAttachmentsOptions) => {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const mountedRef = useRef(true);
  const getOverseerRef = useRef(getOverseer);
  const onErrorRef = useRef(onError);
  getOverseerRef.current = getOverseer;
  onErrorRef.current = onError;

  const updateAttachments = (
    update: (current: ComposerAttachment[]) => ComposerAttachment[],
  ) => {
    const next = update(attachmentsRef.current);
    attachmentsRef.current = next;
    setAttachments(next);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const abandoned = attachmentsRef.current;
      attachmentsRef.current = [];
      for (const attachment of abandoned) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, []);

  // Best effort: the server also sweeps a large upload that no message claims.
  const discardLargeUpload = (uploadId: string) => {
    void Promise.resolve(getOverseerRef.current())
      .then((overseer) => overseer.discardLargeChatAttachmentUpload(uploadId))
      .catch(() => {});
  };

  const uploadAttachment = async (
    id: string,
    blob: Blob,
    mimeType: string,
    name: string | undefined,
  ) => {
    const isGone = () => !mountedRef.current || !attachmentsRef.current.some((item) => item.id === id);
    try {
      const content = blob.size > MAX_CHAT_ATTACHMENT_BYTES
        ? undefined : new Uint8Array(await blob.arrayBuffer());
      if (isGone()) return;
      const overseer = await getOverseerRef.current();
      if (isGone()) return;
      const ref: ChatAttachmentHandle = content
        ? { oid: await overseer.uploadBlob(content), mimeType, name }
        : await uploadLargeChatAttachment(overseer, blob, mimeType, name);
      if (isGone()) {
        // Removed or abandoned while uploading.
        if ("id" in ref) discardLargeUpload(ref.id);
        return;
      }
      updateAttachments((current) => current.map((item) =>
        item.id === id ? { ...item, uploadState: "ready", ref } : item));
    } catch (error) {
      if (isGone()) return;
      console.error("Failed to upload chat attachment:", error);
      reportIssue("chat.attachment-upload", error);
      const message = errorMessage(error, "Upload failed");
      updateAttachments((current) => current.map((item) =>
        item.id === id ? { ...item, uploadState: "error", error: message } : item));
      onErrorRef.current(errorMessage(error, "Failed to upload attachment"));
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const candidates = Array.from(files);
    const initialRoom = MAX_COMPOSER_ATTACHMENTS - attachmentsRef.current.length;
    if (initialRoom <= 0) {
      onErrorRef.current(`You can attach up to ${MAX_COMPOSER_ATTACHMENTS} attachments`);
      return;
    }
    const accepted = candidates.slice(0, initialRoom);
    if (candidates.length > initialRoom) {
      onErrorRef.current(initialRoom === 1
        ? "Only the first attachment was attached"
        : `Only the first ${initialRoom} attachments were attached`);
    }

    const prepared = await Promise.allSettled(accepted.map(async (file) => ({
      file,
      ...(await prepareChatAttachment(file)),
    })));
    if (!mountedRef.current) return;

    for (const result of prepared) {
      if (result.status === "rejected") {
        console.error("Failed to process chat attachment:", result.reason);
        onErrorRef.current(errorMessage(result.reason, "Failed to process attachment"));
        continue;
      }

      const { file, blob, mimeType } = result.value;
      if (attachmentsRef.current.length >= MAX_COMPOSER_ATTACHMENTS) {
        onErrorRef.current(`You can attach up to ${MAX_COMPOSER_ATTACHMENTS} attachments`);
        continue;
      }
      // Small and large attachments have separate totals: only small ones go into model input.
      const isLarge = blob.size > MAX_CHAT_ATTACHMENT_BYTES;
      const totalBytes = attachmentsRef.current.reduce(
        (sum, attachment) =>
          (attachment.blob.size > MAX_CHAT_ATTACHMENT_BYTES) === isLarge ? sum + attachment.blob.size : sum,
        0,
      );
      const totalLimit = isLarge ? MAX_LARGE_CHAT_ATTACHMENT_TOTAL_BYTES : MAX_CHAT_ATTACHMENT_TOTAL_BYTES;
      if (totalBytes + blob.size > totalLimit) {
        onErrorRef.current(
          `Attached ${isLarge ? "large " : ""}files must total ${formatAttachmentSize(totalLimit)} or less`,
        );
        continue;
      }

      const id = crypto.randomUUID();
      const previewUrl = mimeType.startsWith("image/") ? URL.createObjectURL(blob) : undefined;
      const attachment: ComposerAttachment = {
        id,
        blob,
        mimeType,
        name: file.name || undefined,
        previewUrl,
        uploadState: "uploading",
      };
      updateAttachments((current) => [...current, attachment]);
      void uploadAttachment(id, blob, mimeType, file.name || undefined);
    }
  };

  const removeAttachment = (id: string) => {
    const attachment = attachmentsRef.current.find((item) => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    if (attachment?.ref && "id" in attachment.ref) discardLargeUpload(attachment.ref.id);
    updateAttachments((current) => current.filter((item) => item.id !== id));
  };

  const clearSentAttachments = (sent: readonly ComposerAttachment[]) => {
    const sentIds = new Set(sent.map((attachment) => attachment.id));
    for (const attachment of sent) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    updateAttachments((current) => current.filter((attachment) => !sentIds.has(attachment.id)));
  };

  return {
    attachments,
    addFiles,
    clearSentAttachments,
    removeAttachment,
  };
};

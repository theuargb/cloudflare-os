// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RpcStub } from "capnweb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Overseer } from "@gadgets/workshop-shared/api";

const smallBlob = vi.hoisted(() => ({
  size: 4,
  arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
}) as Blob);
const testState = vi.hoisted(() => ({ nextId: 0, uploadBlob: smallBlob }));

vi.mock("./prepareChatAttachment", () => ({
  MAX_CHAT_ATTACHMENT_BYTES: 4 * 1024 * 1024,
  MAX_CHAT_ATTACHMENT_TOTAL_BYTES: 5 * 1024 * 1024,
  prepareChatAttachment: async (file: File) => ({
    blob: testState.uploadBlob,
    mimeType: file.type,
  }),
}));

import {
  useComposerAttachments,
  type ComposerAttachment,
} from "./useComposerAttachments";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const waitFor = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (check()) return;
    await act(async () => Promise.resolve());
  }
  expect(check()).toBe(true);
};

describe("useComposerAttachments", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
    testState.uploadBlob = smallBlob;
  });

  it("uploads raw blobs with message metadata and clears only sent attachments", async () => {
    const uploadBlob = vi.fn<Overseer["uploadBlob"]>(
      async () => (++testState.nextId).toString(16).padStart(40, "0"),
    );
    const firstOverseer = {
      uploadBlob,
    } as unknown as RpcStub<Overseer>;
    const onError = vi.fn<(message: string) => void>();
    let attachments: ComposerAttachment[] = [];
    let addFiles: ((files: File[]) => Promise<void>) | undefined;
    let clearSentAttachments: ((sent: readonly ComposerAttachment[]) => void) | undefined;
    let removeAttachment: ((id: string) => void) | undefined;

    vi.stubGlobal("crypto", { randomUUID: () => `local-${++testState.nextId}` });
    const Harness = () => {
      const attachmentState = useComposerAttachments({
        getOverseer: () => firstOverseer,
        onError,
      });
      attachments = attachmentState.attachments;
      addFiles = attachmentState.addFiles;
      clearSentAttachments = attachmentState.clearSentAttachments;
      removeAttachment = attachmentState.removeAttachment;
      return null;
    };

    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root!.render(<Harness />));

    await act(async () => addFiles!([
      new File(["one"], "one.txt", { type: "text/plain" }),
    ]));
    await waitFor(() => attachments[0]?.uploadState === "ready");
    expect(uploadBlob).toHaveBeenCalledWith(Uint8Array.of(1, 2, 3, 4));
    expect(attachments[0].ref).toEqual({
      oid: expect.stringMatching(/^[0-9a-f]{40}$/), mimeType: "text/plain", name: "one.txt",
    });
    const sentSnapshot = [...attachments];

    await act(async () => addFiles!([
      new File(["two"], "two.txt", { type: "text/plain" }),
    ]));
    await waitFor(() => attachments.length === 2 && attachments[1].uploadState === "ready");
    act(() => clearSentAttachments!(sentSnapshot));

    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe("two.txt");
    expect(onError).not.toHaveBeenCalled();

    act(() => removeAttachment!(attachments[0].id));
    expect(attachments).toHaveLength(0);
  });

  it("uploads a file over the blob limit in parts and discards it when removed", async () => {
    const partBytes = 8 * 1024 * 1024;
    const size = partBytes + 10;
    testState.uploadBlob = {
      size,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => new Uint8Array(Math.min(end, size) - start).fill(start / partBytes + 1).buffer,
      }),
    } as unknown as Blob;
    const uploadBlob = vi.fn<Overseer["uploadBlob"]>();
    const beginLargeChatAttachmentUpload = vi.fn<Overseer["beginLargeChatAttachmentUpload"]>(
      async () => ({ id: "upload-1", partBytes }));
    const uploadLargeChatAttachmentPart = vi.fn<Overseer["uploadLargeChatAttachmentPart"]>(async () => {});
    const completeLargeChatAttachmentUpload = vi.fn<Overseer["completeLargeChatAttachmentUpload"]>(
      async (id) => ({ id }));
    const discardLargeChatAttachmentUpload = vi.fn<Overseer["discardLargeChatAttachmentUpload"]>(async () => {});
    const overseer = {
      uploadBlob,
      beginLargeChatAttachmentUpload,
      uploadLargeChatAttachmentPart,
      completeLargeChatAttachmentUpload,
      discardLargeChatAttachmentUpload,
    } as unknown as RpcStub<Overseer>;
    let attachments: ComposerAttachment[] = [];
    let addFiles!: (files: File[]) => Promise<void>;
    let removeAttachment!: (id: string) => void;
    vi.stubGlobal("crypto", { randomUUID: () => "local-large" });
    const Harness = () => {
      const state = useComposerAttachments({ getOverseer: () => overseer, onError: vi.fn<(message: string) => void>() });
      attachments = state.attachments;
      addFiles = state.addFiles;
      removeAttachment = state.removeAttachment;
      return null;
    };
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root!.render(<Harness />));

    await act(async () => addFiles([new File(["x"], "big.bin", { type: "application/octet-stream" })]));
    await waitFor(() => attachments[0]?.uploadState === "ready");

    expect(beginLargeChatAttachmentUpload).toHaveBeenCalledWith(
      { mimeType: "application/octet-stream", size, name: "big.bin" });
    expect(uploadLargeChatAttachmentPart.mock.calls.map(([part]) => [part.id, part.partNo, part.bytes.byteLength]))
      .toEqual([["upload-1", 1, partBytes], ["upload-1", 2, 10]]);
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(attachments[0].ref).toEqual({ id: "upload-1" });

    act(() => removeAttachment(attachments[0].id));
    await waitFor(() => discardLargeChatAttachmentUpload.mock.calls.length === 1);
    expect(discardLargeChatAttachmentUpload).toHaveBeenCalledWith("upload-1");
  });

  it("ignores a blob upload that finishes after the composer unmounts", async () => {
    let finishUpload!: (oid: string) => void;
    const uploadBlob = vi.fn<Overseer["uploadBlob"]>(
      () => new Promise((resolve) => { finishUpload = resolve; }),
    );
    const overseer = {
      uploadBlob,
    } as unknown as RpcStub<Overseer>;
    let addFiles!: (files: File[]) => Promise<void>;
    vi.stubGlobal("crypto", { randomUUID: () => "local-race" });

    const Harness = () => {
      ({ addFiles } = useComposerAttachments({
        getOverseer: () => overseer,
        onError: vi.fn<(message: string) => void>(),
      }));
      return null;
    };
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root!.render(<Harness />));
    await act(async () => addFiles([
      new File(["one"], "one.txt", { type: "text/plain" }),
    ]));
    await waitFor(() => uploadBlob.mock.calls.length === 1);

    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => finishUpload("1".repeat(40)));
    expect(uploadBlob).toHaveBeenCalledTimes(1);
  });
});

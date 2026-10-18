// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MAX_LARGE_CHAT_ATTACHMENT_BYTES } from "@gadgets/workshop-shared/api";
import { MAX_CHAT_ATTACHMENT_BYTES, prepareChatAttachment } from "./prepareChatAttachment";

describe("prepareChatAttachment", () => {
  it.each(["text/plain", "application/pdf", "application/zip", "application/octet-stream", "image/png", "image/gif", "image/svg+xml"])(
    "preserves the original %s file without decoding, resizing or re-encoding", async type => {
      const file = new File([Uint8Array.of(0, 255, 42)], "input", {type});
      const prepared = await prepareChatAttachment(file);
      expect(prepared.blob).toBe(file);
      expect(prepared.mimeType).toBe(type);
    },
  );

  it("uses octet-stream for an unknown file type", async () => {
    const file = new File([Uint8Array.of(0, 255)], "unknown");
    await expect(prepareChatAttachment(file)).resolves.toEqual({blob: file, mimeType: "application/octet-stream"});
  });

  it.each(["application/octet-stream", "image/png"])("enforces the large-upload limit for %s", async type => {
    const file = new File([Uint8Array.of(0)], "large", {type});
    Object.defineProperty(file, "size", {value: MAX_LARGE_CHAT_ATTACHMENT_BYTES + 1});
    await expect(prepareChatAttachment(file)).rejects.toThrow("Attachments must be 100.0 MB or smaller.");
  });

  it("accepts a file above the blob limit, to be uploaded in parts", async () => {
    const file = new File([new Uint8Array(MAX_CHAT_ATTACHMENT_BYTES + 1)], "big.bin");
    await expect(prepareChatAttachment(file)).resolves.toMatchObject({blob: file});
  });

  it("accepts an original image exactly at the limit without resizing it", async () => {
    const file = new File([new Uint8Array(MAX_CHAT_ATTACHMENT_BYTES)], "at-limit.png", {type: "image/png"});
    const prepared = await prepareChatAttachment(file);
    expect(prepared.blob).toBe(file);
    expect(prepared.blob.size).toBe(MAX_CHAT_ATTACHMENT_BYTES);
  });
});

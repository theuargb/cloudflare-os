import { describe, expect, it } from "vitest";
import { env, RpcStub as NativeRpcStub } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { createFauxCore, fauxAssistantMessage, fauxText, type Message } from "@earendil-works/pi-ai";
import { runAgent } from "../src/agent";
import type { AiChatAuthorInfo, AiChatMessage, ChatAttachmentRef, Overseer } from "@gadgets/workshop-shared/api";
import { MAX_LARGE_CHAT_ATTACHMENT_BYTES } from "@gadgets/workshop-shared/api";
import { LARGE_CHAT_ATTACHMENT_PART_BYTES } from "../src/chat-attachment-validation";
import type { OverseerDurableObject } from "../src/overseer.js";
import type { UserDurableObject } from "../src/user.js";

declare module "cloudflare:workers" {
  interface ProvidedEnv {
    TEST_OVERSEER: DurableObjectNamespace<OverseerDurableObject>;
    TEST_USER: DurableObjectNamespace<UserDurableObject>;
  }
}

// Exercises attachments over the Git-blob limit through the real Overseer in workerd, against the
// pool's R2 bucket: uploading in parts, attaching to a message, reading back, and cleanup.

const OWNER_USER_ID = "owner-user-do";
const OWNER: AiChatAuthorInfo = {
  type: "user", id: "olive@example.com", name: "Olive", commitEmail: "olive@commits.example",
};

const PART = LARGE_CHAT_ATTACHMENT_PART_BYTES;
// Two parts, the second one short.
const SIZE = PART + 1024 * 1024;

interface Workspace {
  impl: any;
  client: Overseer;
}

let counter = 0;

async function withWorkspace(fn: (workspace: Workspace) => Promise<void>): Promise<void> {
  let stub = env.TEST_OVERSEER.getByName(`large-attachments-${++counter}`);
  await runInDurableObject(stub, async (instance: OverseerDurableObject) => {
    let impl = (instance as unknown as { impl: any }).impl;
    impl.ownerId = OWNER_USER_ID;
    impl.ensureAmbientCapsules = async () => {};
    impl.markOutputsDirty = () => {};
    let owner = {
      id: OWNER_USER_ID,
      whoami: async () => OWNER,
      getChatContext: async () => ({ profile: OWNER }),
      listGatekeeperVendors: async () => [],
      setGadgetLastActive: async () => {},
    };
    impl.users = { idFromString: (id: string) => id, get: () => owner };
    using notifyClosed = new NativeRpcStub<() => void>(() => {});
    using client = await instance.open(OWNER_USER_ID, OWNER.id, notifyClosed);
    await fn({ impl, client });
  });
}

// A file whose every byte depends on its position, so a misplaced or truncated part shows.
function patterned(size: number): Uint8Array {
  let bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + (i >> 16)) & 0xff;
  return bytes;
}

async function upload(client: Overseer, bytes: Uint8Array, mimeType = "application/octet-stream") {
  let { id, partBytes } = await client.beginLargeChatAttachmentUpload(
      { mimeType, size: bytes.length, name: "big.bin" });
  for (let offset = 0, partNo = 1; offset < bytes.length; offset += partBytes, partNo++) {
    await client.uploadLargeChatAttachmentPart({ id, partNo, bytes: bytes.slice(offset, offset + partBytes) });
  }
  return { id, handle: await client.completeLargeChatAttachmentUpload(id) };
}

// `toEqual` on multi-megabyte arrays exhausts the isolate's memory, so compare by hand.
function expectSameBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length);
  let firstDifference = actual.findIndex((byte, i) => byte !== expected[i]);
  expect(firstDifference).toBe(-1);
}

async function readAll(client: Overseer, chatId: number, id: string): Promise<Uint8Array> {
  let chunks: Uint8Array[] = [];
  for (let offset = 0, size = 1; offset < size;) {
    let part = await client.getChatAttachmentContentPart(chatId, id, offset);
    if (part.bytes.length === 0) throw new Error(`empty part at ${offset} of ${part.size}`);
    chunks.push(part.bytes);
    offset += part.bytes.length;
    size = part.size;
  }
  let result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (let chunk of chunks) { result.set(chunk, at); at += chunk.length; }
  return result;
}

async function attachmentOf(client: Overseer, chatId: number): Promise<ChatAttachmentRef> {
  let message = (await client.getChatHistory(chatId)).messages.find(
      (candidate: AiChatMessage) => candidate.type === "message");
  if (message?.type !== "message") throw new Error("Expected a message");
  return message.attachments![0];
}

describe("large chat attachments", () => {
  it("round-trips through parts, stays out of the workspace and is deleted with its chat", () =>
    withWorkspace(async ({ impl, client }) => {
      let bytes = patterned(SIZE);
      let { id, handle } = await upload(client, bytes, "application/zip");
      expect(handle).toEqual({ id });

      let chatId = await client.newChat("Here is a big file", null, undefined, [handle]);
      let ref = await attachmentOf(client, chatId);
      expect(ref).toMatchObject({ id, mimeType: "application/zip", name: "big.bin", size: SIZE, large: true });
      expect(ref.workspacePath).toBeUndefined();
      expect(ref.oid).toBeUndefined();
      expect(impl.getChatAgentContext(chatId).scratch).toBeUndefined();

      expectSameBytes(await readAll(client, chatId, id), bytes);
      await expect(client.getChatAttachmentContent(chatId, id)).rejects.toThrow("read it in parts");
      await expect(client.getChatAttachmentContentPart(chatId + 1, id, 0)).rejects.toThrow("not found");
      await expect(client.getChatAttachmentContentPart(chatId, id, SIZE + 1)).rejects.toThrow("offset");

      let key = impl.storage.largeChatAttachments.get(id).key;
      expect(await env.CHAT_ATTACHMENT_CONTENT!.head(key)).not.toBeNull();
      await client.deleteChat(chatId);
      expect(await env.CHAT_ATTACHMENT_CONTENT!.head(key)).toBeNull();
      expect(impl.storage.largeChatAttachments.get(id)).toBeUndefined();
    }));

  it("streams an attachment through its handle only while it is committed to its chat", () =>
    withWorkspace(async ({ impl, client }) => {
      let bytes = patterned(SIZE);
      let { id, handle } = await upload(client, bytes, "text/csv");
      let chatId = await client.newChat("Data", null, undefined, [handle]);

      let opened = await impl.openChatAttachment(impl.mintChatAttachmentHandle(chatId, id));
      expect(opened).toMatchObject({ size: SIZE, mime: "text/csv" });
      expectSameBytes(new Uint8Array(await new Response(opened.stream).arrayBuffer()), bytes);

      let forged = JSON.stringify([impl.ctx.id.toString(), chatId + 1, id]);
      await expect(impl.openChatAttachment(forged)).rejects.toThrow("not found");
      await expect(impl.openChatAttachment("nonsense")).rejects.toThrow("Invalid chat attachment handle");

      let live = impl.mintChatAttachmentHandle(chatId, id);
      await client.deleteChat(chatId);
      await expect(impl.openChatAttachment(live)).rejects.toThrow("not found");
    }));

  it("lists a handle for the agent in place of bytes", () =>
    withWorkspace(async ({ impl, client }) => {
      let big = await upload(client, patterned(SIZE), "text/csv");
      let chatId = await client.newChat("Data", null, undefined, [big.handle]);
      let session = await impl.startGatekeeperSession({ type: "attachments" }, { from: "agent", chatId });

      let [listed] = await session.list();
      expect(listed).toMatchObject({ id: big.id, name: "big.bin", mime: "text/csv", size: SIZE });
      expect(listed.handle).toBe(impl.mintChatAttachmentHandle(chatId, big.id));
      await expect(session.get(big.id)).rejects.toThrow("stream it with its `handle`");
    }));

  it("lists a handle for a small attachment and opens it", () =>
    withWorkspace(async ({ impl, client }) => {
      let bytes = new TextEncoder().encode("small csv,whatever\n");
      let oid = await client.uploadBlob(bytes);
      let chatId = await client.newChat("Data", null, undefined, [{ oid, mimeType: "text/csv", name: "small.csv" }]);

      let session = await impl.startGatekeeperSession({ type: "attachments" }, { from: "agent", chatId });
      let [listed] = await session.list();
      expect(listed.name).toBe("small.csv");
      let opened = await impl.openChatAttachment(listed.handle);
      expect(opened.size).toBe(bytes.byteLength);
      expect(opened.mime).toBe("text/csv");
      expectSameBytes(new Uint8Array(await new Response(opened.stream).arrayBuffer()), bytes);

      // A handle for a chat the attachment is not committed to opens nothing.
      await expect(impl.openChatAttachment(
          JSON.stringify([impl.ctx.id.toString(), chatId + 1, listed.id])))
          .rejects.toThrow("not found");
    }));

  it("replays a large attachment to the model as a marker, never its bytes", () =>
    withWorkspace(async ({ impl, client }) => {
      let big = await upload(client, patterned(SIZE), "application/x-unknown");
      let chatId = await client.newChat("Look", null, undefined, [big.handle]);

      let faux = createFauxCore({ models: [{ id: "faux-model", contextWindow: 8_000_000 }] });
      faux.setResponses([fauxAssistantMessage(fauxText("Done"))]);
      let requests: Message[][] = [];
      await runAgent(impl, {
        model: faux.getModel(),
        stream: (model, context, options) => {
          requests.push(structuredClone(context.messages));
          return faux.stream(model, context, options);
        },
      }, chatId, { type: "agent", id: "test", name: "Test" }, new AbortController().signal, OWNER,
      { provider: "cloudflare", model: "faux-model", apiToken: "", contextWindow: 8_000_000 });

      let user = requests[0].find(message => message.role === "user");
      let text = JSON.stringify(user?.content);
      expect(text).toContain(`id ${big.id}`);
      expect(text).toContain("not readable as model input");
      expect(text).toContain("Read it through a module that reads attachment handles");
      expect(text).not.toContain("currently unavailable");
    }));

  it("refuses sizes outside the large range, a bad part, and a deployment without the bucket", () =>
    withWorkspace(async ({ impl, client }) => {
      let begin = (size: number, mimeType = "application/octet-stream") =>
          client.beginLargeChatAttachmentUpload({ mimeType, size });
      await expect(begin(4 * 1024 * 1024)).rejects.toThrow("Large chat attachments must be");
      await expect(begin(MAX_LARGE_CHAT_ATTACHMENT_BYTES + 1)).rejects.toThrow("Large chat attachments must be");
      await expect(begin(1.5 * PART)).resolves.toBeDefined();

      let { id } = await begin(SIZE);
      let part = (partNo: number, length: number, fill = 7) =>
          client.uploadLargeChatAttachmentPart({ id, partNo, bytes: new Uint8Array(length).fill(fill) });
      await expect(part(1, PART - 1)).rejects.toThrow("wrong length");
      await expect(part(2, PART)).rejects.toThrow("wrong length");
      await expect(part(3, 1)).rejects.toThrow("out of range");
      await expect(part(0, PART)).rejects.toThrow("out of range");

      // The first part must look like the type it is labeled as.
      let { id: pdfId } = await begin(SIZE, "application/pdf");
      await expect(client.uploadLargeChatAttachmentPart(
          { id: pdfId, partNo: 1, bytes: new Uint8Array(PART) })).rejects.toThrow("does not match its MIME type");

      let withoutBucket = { ...impl.env, CHAT_ATTACHMENT_CONTENT: undefined };
      let original = impl.env;
      impl.env = withoutBucket;
      try {
        await expect(begin(SIZE)).rejects.toThrow("does not store large chat attachments");
      } finally {
        impl.env = original;
      }
    }));

  it("discards an upload that is completed with a part missing", () =>
    withWorkspace(async ({ impl, client }) => {
      let { id } = await client.beginLargeChatAttachmentUpload({ mimeType: "text/plain", size: SIZE });
      let key = impl.storage.largeChatAttachments.get(id).key;
      await client.uploadLargeChatAttachmentPart({ id, partNo: 1, bytes: new Uint8Array(PART) });

      await expect(client.completeLargeChatAttachmentUpload(id)).rejects.toThrow("missing parts");
      expect(impl.storage.largeChatAttachments.get(id)).toBeUndefined();
      expect(await env.CHAT_ATTACHMENT_CONTENT!.head(key)).toBeNull();
      await expect(client.uploadLargeChatAttachmentPart(
          { id, partNo: 2, bytes: new Uint8Array(SIZE - PART) })).rejects.toThrow("not found");
    }));

  it("lets a re-sent part replace the first, and a discarded upload cannot be attached", () =>
    withWorkspace(async ({ impl, client }) => {
      let bytes = patterned(SIZE);
      let { id, partBytes } = await client.beginLargeChatAttachmentUpload(
          { mimeType: "application/octet-stream", size: SIZE });
      await client.uploadLargeChatAttachmentPart({ id, partNo: 1, bytes: new Uint8Array(partBytes).fill(9) });
      await client.uploadLargeChatAttachmentPart({ id, partNo: 1, bytes: bytes.slice(0, partBytes) });
      await client.uploadLargeChatAttachmentPart({ id, partNo: 2, bytes: bytes.slice(partBytes) });
      let handle = await client.completeLargeChatAttachmentUpload(id);
      let chatId = await client.newChat("Replaced", null, undefined, [handle]);
      expectSameBytes(await readAll(client, chatId, id), bytes);

      // Already attached: neither discarding it nor attaching it again does anything.
      await client.discardLargeChatAttachmentUpload(id);
      expect(impl.storage.largeChatAttachments.get(id)).toBeDefined();
      await expect(client.newChat("Again", null, undefined, [handle])).rejects.toThrow("not found");

      let other = await upload(client, patterned(SIZE));
      await client.discardLargeChatAttachmentUpload(other.id);
      await expect(client.newChat("Gone", null, undefined, [other.handle])).rejects.toThrow("not found");
    }));

  it("sweeps uploads nobody attached when the next one starts", () =>
    withWorkspace(async ({ impl, client }) => {
      let stale = await upload(client, patterned(SIZE));
      let fresh = await upload(client, patterned(SIZE));
      let staleKey = impl.storage.largeChatAttachments.get(stale.id).key;
      impl.storage.largeChatAttachments.put({
        ...impl.storage.largeChatAttachments.get(stale.id), uploadedAt: Date.now() - 25 * 60 * 60 * 1000,
      });

      await client.beginLargeChatAttachmentUpload({ mimeType: "text/plain", size: SIZE });
      expect(impl.storage.largeChatAttachments.get(stale.id)).toBeUndefined();
      expect(await env.CHAT_ATTACHMENT_CONTENT!.head(staleKey)).toBeNull();
      expect(impl.storage.largeChatAttachments.get(fresh.id)).toBeDefined();
    }));

  it("caps the total of a message's large attachments", () =>
    withWorkspace(async ({ impl, client }) => {
      // Records only: the cap is checked from declared sizes, before any content is touched.
      let handles = [];
      for (let i = 0; i < 4; i++) {
        let fileId = crypto.randomUUID();
        impl.storage.largeChatAttachments.put({
          fileId, key: `chat-attachments/${fileId}`, size: MAX_LARGE_CHAT_ATTACHMENT_BYTES,
          mimeType: "text/plain", uploadedAt: Date.now(), parts: [],
        });
        handles.push({ id: fileId });
      }
      await expect(client.newChat("Too much", null, undefined, handles)).rejects.toThrow("too large");
      await expect(client.newChat("Fine", null, undefined, handles.slice(0, 3))).resolves.toBeDefined();
    }));
});

import type { AiChatMessage } from "@gadgets/workshop-shared/api";

/** One page of `Overseer.getChatHistory`, as far as the voice call needs it. */
export type ChatPage = { messages: AiChatMessage[]; compacted?: { to: number } };

/**
 * The chat's messages after `afterSequence`, paging back across compaction boundaries (the tail
 * page starts at the latest one); the tail page when `afterSequence` is absent.
 */
export async function readChatMessages(
  page: (beforeSequence?: number) => Promise<ChatPage>,
  afterSequence?: number,
): Promise<AiChatMessage[]> {
  let current = await page();
  let messages = current.messages;
  if (afterSequence === undefined) return messages;
  while (current.compacted) {
    let before = messages[0]?.sequence ?? current.compacted.to;
    if (before <= afterSequence + 1) break;
    current = await page(before);
    if (!current.messages.length) break;
    messages = [...current.messages, ...messages];
  }
  return messages.filter((msg) => msg.sequence > afterSequence);
}

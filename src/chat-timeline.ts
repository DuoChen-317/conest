import type { Item } from "./api";
export type ChatScope = {
  kind: "office" | "lounge" | "meeting" | "direct";
  meetingId?: string;
  conversationId?: string;
};
export function scopeQuery(scope: ChatScope) {
  return new URLSearchParams(
    Object.entries(scope).filter(([, value]) => value !== undefined) as [
      string,
      string,
    ][],
  );
}
export function mergeMessages(earlier: Item[], later: Item[]) {
  const messages = new Map<string, Item>();
  for (const message of [...earlier, ...later]) {
    if (messages.get(message.id)?.redacted_at && !message.redacted_at) continue;
    messages.set(message.id, message);
  }
  return [...messages.values()];
}
export function matchesScope(
  message: Item,
  projectId: string,
  scope: ChatScope,
  viewerId?: string,
) {
  if (scope.kind === "direct")
    return message.conversation_id === scope.conversationId;
  if (message.project_id !== projectId) return false;
  if (scope.kind === "office")
    return !!message.owner_id && (!viewerId || message.owner_id === viewerId);
  return (
    !message.owner_id &&
    (scope.kind === "meeting"
      ? message.meeting_id === scope.meetingId
      : !message.meeting_id)
  );
}

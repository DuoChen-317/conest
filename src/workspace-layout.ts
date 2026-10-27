export const defaultChatWidth = 300;
export const workspacePreferenceKey = "conest.office.layout.v1";
export const clampSceneHeight = (height: number) =>
  Math.round(Math.max(320, Math.min(1000, height)));
export function chatWidthBounds(width: number) {
  return { min: 260, max: Math.max(260, Math.min(640, width - 420 - 14)) };
}
export function clampChatWidth(chatWidth: number, width: number) {
  const { min, max } = chatWidthBounds(width);
  return Math.round(Math.max(min, Math.min(max, chatWidth)));
}
export function parseWorkspacePreference(value: string | null) {
  const defaults = {
    chatWidth: defaultChatWidth,
    sceneHeight: null as number | null,
  };
  try {
    const saved = JSON.parse(value ?? "null");
    return {
      chatWidth:
        typeof saved?.chatWidth === "number" && Number.isFinite(saved.chatWidth)
          ? Math.max(260, Math.min(640, saved.chatWidth))
          : defaults.chatWidth,
      sceneHeight:
        typeof saved?.sceneHeight === "number" &&
        Number.isFinite(saved.sceneHeight)
          ? clampSceneHeight(saved.sceneHeight)
          : null,
    };
  } catch {
    return defaults;
  }
}

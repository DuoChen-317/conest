export async function copyText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Embedded browsers may expose Clipboard API but deny writes.
  }
  const active = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.setAttribute("aria-hidden", "true");
  input.style.cssText =
    "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
  let copied = false;
  try {
    document.body.append(input);
    input.focus({ preventScroll: true });
    input.select();
    copied = document.execCommand("copy");
  } catch {
    // Report failure below and let the UI offer manual copying.
  } finally {
    input.remove();
    if (active instanceof HTMLElement) active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
  if (!copied) throw new Error("Clipboard unavailable");
}

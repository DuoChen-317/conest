import type { Row } from "./store.ts";

const stopWords = new Set([
  "这个",
  "那个",
  "我们",
  "你们",
  "然后",
  "现在",
  "就是",
  "可以",
  "怎么",
  "什么",
  "一下",
  "还是",
  "是否",
  "需要",
  "已经",
  "之前",
  "当前",
  "the",
  "and",
  "this",
  "that",
  "with",
  "from",
  "what",
  "please",
]);
export function contextTerms(text: string) {
  const terms: string[] = [];
  for (const match of text
    .toLowerCase()
    .matchAll(/[a-z][a-z0-9_.-]{2,40}|[\p{Script=Han}]{2,}/gu)) {
    if (/^[a-z]/.test(match[0])) terms.push(match[0]);
    else
      for (let index = 0; index < Math.min(match[0].length - 1, 80); index++)
        terms.push(match[0].slice(index, index + 2));
  }
  return [...new Set(terms)]
    .filter((term) => !stopWords.has(term))
    .slice(0, 24);
}
export function historyExcerpt(row: Row, terms: string[], length = 900) {
  const body = String(row.body);
  const lower = body.toLowerCase();
  const index =
    terms.map((term) => lower.indexOf(term)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, index - Math.floor(length / 3));
  return {
    messageId: row.id,
    name: row.actor_name,
    createdAt: row.created_at,
    quote: body.slice(start, start + length),
    truncated: start > 0 || body.length > start + length,
  };
}
export function recentContext(rows: Row[], trigger: Row, budget = 16000) {
  const selected: Row[] = [trigger];
  let remaining = Math.max(0, budget - trigger.body.length);
  for (const row of [...rows].reverse()) {
    if (row.id === trigger.id || !row.body) continue;
    if (remaining < 200) break;
    if (row.body.length <= remaining) {
      selected.push(row);
      remaining -= row.body.length;
    } else {
      const half = Math.floor((remaining - 40) / 2);
      selected.push({
        ...row,
        body:
          row.body.slice(0, half) +
          "\n[... earlier message shortened ...]\n" +
          row.body.slice(-half),
        truncated: true,
      });
      break;
    }
  }
  return selected
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((row) => ({
      messageId: row.id,
      name: row.actor_name,
      role: row.actor_type,
      body: row.body,
      ...(row.truncated ? { truncated: true } : {}),
    }));
}

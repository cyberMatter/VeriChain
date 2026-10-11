// ledger.js: all the logic, with no DOM, so the same code runs in the browser and in Node tests.
const subtle = globalThis.crypto?.subtle ?? (await import("node:crypto")).webcrypto.subtle;

export const GENESIS = "0".repeat(64);
// The fields that are sealed into each card's hash, in a fixed order.
export const FIELDS = ["claim", "quote", "author", "title", "url", "published", "accessed", "status", "sourceHash", "prev"];

export function normalize(text) {
  return String(text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

// Looser form used only for finding a quote inside a source (case, curly quotes, dashes).
const loose = (t) =>
  normalize(t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").toLowerCase();

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Checks that a quote appears word-for-word in the source text.
// Debate-style cuts are allowed: "first part [...] last part" must appear in that order.
export function quoteInSource(quote, source) {
  const src = loose(source);
  const parts = loose(quote).split(/\s*(?:\[\s*\.\.\.\s*\]|\.\.\.)\s*/).filter(Boolean);
  if (!parts.length) return { ok: false, missing: "" };
  let from = 0;
  for (const part of parts) {
    const at = src.indexOf(part, from);
    if (at === -1) return { ok: false, missing: part };
    from = at + part.length;
  }
  return { ok: true, missing: null };
}

export const canonical = (card) => JSON.stringify(FIELDS.map((f) => card[f] ?? null));

// Turns an evidence card into a sealed card linked to the previous one.
// If source text is supplied, the quote must be found in it, otherwise sealing fails.
export async function sealCard(input, prevCard = null, accessed = new Date().toISOString().slice(0, 10)) {
  const claim = normalize(input.claim);
  const quote = normalize(input.quote);
  if (!claim || !quote) throw new Error("A card needs both a claim and a quote.");

  const source = normalize(input.sourceText);
  let status = "unverified";
  let sourceHash = null;
  if (source) {
    const check = quoteInSource(quote, source);
    if (!check.ok) throw new Error(`Quote not found in the source text: "${check.missing}"`);
    status = "verified";
    sourceHash = await sha256(source);
  }

  const card = {
    claim, quote,
    author: normalize(input.author),
    title: normalize(input.title),
    url: normalize(input.url),
    published: normalize(input.published),
    accessed, status, sourceHash,
    prev: prevCard ? prevCard.hash : GENESIS,
  };
  card.hash = await sha256(canonical(card));
  return card;
}

// Re-computes every hash and link. Any edit, deletion or reordering shows up as a failure.
export async function verifyChain(cards) {
  const results = [];
  let prev = GENESIS;
  for (const [index, raw] of cards.entries()) {
    const card = raw && typeof raw === "object" ? raw : {};
    let reason = null;
    if (card.prev !== prev) reason = "link broken: this card does not follow the one before it";
    else if ((await sha256(canonical(card))) !== card.hash) reason = "content changed after sealing";
    results.push({ index, hash: card.hash ?? "", ok: !reason, reason });
    prev = card.hash;
  }
  return { ok: results.every((r) => r.ok), results };
}

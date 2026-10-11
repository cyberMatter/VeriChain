// ledger.js: all the logic, with no DOM, so the same code runs in the browser and in Node tests.
const subtle = globalThis.crypto?.subtle ?? (await import("node:crypto")).webcrypto.subtle;
const enc = new TextEncoder();

export const GENESIS = "0".repeat(64);
export const FORMAT = "evidence-chain/2";
// The fields sealed into each card's hash, in a fixed order.
export const FIELDS = ["claim", "quote", "author", "title", "url", "archive", "published", "accessed", "status", "sourceHash", "prev"];

const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };

export function normalize(text) {
  return String(text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

// Looser form used only for finding a quote inside a source (case, curly quotes, dashes).
const loose = (t) =>
  normalize(t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").toLowerCase();

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

export async function sha256(text) {
  return toHex(await subtle.digest("SHA-256", enc.encode(text)));
}

// Checks that a quote appears word for word in the source text.
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
// With source text, the quote must be found in it, and the card is marked "matched".
// Without it the card is marked "unchecked". Neither status says the source is true.
export async function sealCard(input, prevCard = null, accessed = new Date().toISOString().slice(0, 10)) {
  const claim = normalize(input.claim);
  const quote = normalize(input.quote);
  if (!claim || !quote) throw new Error("A card needs both a claim and a quote.");

  const source = normalize(input.sourceText);
  let status = "unchecked";
  let sourceHash = null;
  if (source) {
    const check = quoteInSource(quote, source);
    if (!check.ok) throw new Error(`Quote not found in the supplied text: "${check.missing}"`);
    status = "matched";
    sourceHash = await sha256(source);
  }

  const card = {
    claim, quote,
    author: normalize(input.author),
    title: normalize(input.title),
    url: normalize(input.url),
    archive: normalize(input.archive),
    published: normalize(input.published),
    accessed, status, sourceHash,
    prev: prevCard ? prevCard.hash : GENESIS,
  };
  card.hash = await sha256(canonical(card));
  return card;
}

// Re-computes every hash and link. Each failing result says what was expected and what was found.
export async function verifyChain(cards) {
  const results = [];
  let prev = GENESIS;
  for (const [index, raw] of cards.entries()) {
    const card = raw && typeof raw === "object" ? raw : {};
    const actual = await sha256(canonical(card));
    let reason = null, expected = null, found = null;
    if (card.prev !== prev) {
      reason = "link broken: this card does not follow the one before it";
      expected = prev; found = card.prev ?? "";
    } else if (actual !== card.hash) {
      reason = "content changed after sealing";
      expected = card.hash ?? ""; found = actual;
    }
    results.push({ index, hash: card.hash ?? "", ok: !reason, reason, expected, found });
    prev = card.hash;
  }
  return { ok: results.every((r) => r.ok), results };
}

// ---------------------------------------------------------------- signatures
// An author key signs the chain's size and last hash. Without that key nobody can truncate,
// extend or rebuild the chain and keep a valid signature. The fingerprint identifies the key:
// share it once, and every chain you sign can be checked against it.

export const generateAuthorKey = () => subtle.generateKey(ECDSA, false, ["sign", "verify"]); // private key not extractable

export async function publicJwk(keyPair) {
  const j = await subtle.exportKey("jwk", keyPair.publicKey);
  return { kty: j.kty, crv: j.crv, x: j.x, y: j.y };
}

export async function fingerprint(pub) {
  const h = await sha256(JSON.stringify([pub.crv, pub.x, pub.y]));
  return h.slice(0, 16).toUpperCase().match(/.{4}/g).join("-");
}

const headMessage = (count, hash) => `verichain/2|${count}|${hash}`;

export async function signChain(cards, keyPair) {
  const pub = await publicJwk(keyPair);
  const head = { count: cards.length, hash: cards.at(-1)?.hash ?? GENESIS };
  const sig = await subtle.sign(SIGN, keyPair.privateKey, enc.encode(headMessage(head.count, head.hash)));
  return { author: { publicKey: pub, fingerprint: await fingerprint(pub) }, head: { ...head, signature: toHex(sig) } };
}

// Returns { state: "unsigned" | "valid" | "invalid", fingerprint, reason }.
export async function verifySignature(file) {
  const signature = file?.head?.signature;
  const pub = file?.author?.publicKey;
  if (!signature || !pub) return { state: "unsigned", fingerprint: null, reason: null };
  let fp = null;
  const invalid = (reason) => ({ state: "invalid", fingerprint: fp, reason });
  try {
    fp = await fingerprint(pub);
    const cards = file.cards ?? [];
    const count = cards.length;
    const hash = cards.at(-1)?.hash ?? GENESIS;
    if (file.author.fingerprint !== fp) return invalid("the stated key fingerprint does not match the key");
    if (file.head.count !== count || file.head.hash !== hash) {
      return invalid("the chain no longer matches what the author signed (cards were removed, added or rebuilt)");
    }
    const key = await subtle.importKey("jwk", { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, ext: true }, ECDSA, true, ["verify"]);
    const ok = await subtle.verify(SIGN, key, fromHex(signature), enc.encode(headMessage(count, hash)));
    return ok ? { state: "valid", fingerprint: fp, reason: null } : invalid("the signature is not valid for this chain");
  } catch {
    return invalid("the signature could not be read");
  }
}

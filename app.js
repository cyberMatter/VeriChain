import { sealCard, verifyChain, verifySignature, quoteInSource, generateAuthorKey, signChain, publicJwk, fingerprint, FORMAT } from "./ledger.js";
import { SAMPLE } from "./sample.js";

const $ = (id) => document.getElementById(id);
const STORE = "verichain2";
const FORM = ["claim", "quote", "source", "author", "title", "url", "archive", "published"];
// "matched" means the quote was found word for word in the text supplied. It never means the source is true.
const LABEL = { matched: "QUOTE MATCHED", unchecked: "NOT CHECKED" };

let chain = [];
let meta = null;                      // { author, head } from a loaded or exported file, or null
let check = { ok: true, results: [] };
let sig = { state: "unsigned", fingerprint: null, reason: null };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  chain = Array.isArray(saved.cards) ? saved.cards : [];
  meta = saved.meta || null;
} catch { chain = []; }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ cards: chain, meta })); } catch { /* storage unavailable */ } };
const short = (hash) => (hash && hash.length > 9 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash || "none");
const plain = (fp) => String(fp || "").toUpperCase().replace(/[^0-9A-F]/g, "");

// ---- author key: a non-extractable ECDSA key kept in this browser (IndexedDB) ----
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("verichain-keys", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("k");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadKey() {
  try {
    const db = await idb();
    const found = await new Promise((res, rej) => { const q = db.transaction("k").objectStore("k").get("author"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (found) return found;
    const pair = await generateAuthorKey();
    await new Promise((res, rej) => { const t = db.transaction("k", "readwrite"); t.objectStore("k").put(pair, "author"); t.oncomplete = res; t.onerror = () => rej(t.error); });
    return pair;
  } catch {
    return generateAuthorKey(); // storage blocked (for example private mode): the key lasts for this visit only
  }
}
const keyPromise = loadKey();
keyPromise.then(async (pair) => { $("myKey").textContent = await fingerprint(await publicJwk(pair)); });

// ---- small DOM helpers (text is always set with textContent, never as HTML) ----
function h(tag, cls, ...kids) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...kids);
  return node;
}
function hashEl(label, value) {
  const span = h("span", "", `${label}: ${short(value)}`);
  span.title = value || "";
  return span;
}
function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}
function say(el, text, kind = "") { el.textContent = text; el.className = el.className.split(" ")[0] + " " + kind; }
const flash = (text, kind = "ok") => say($("flash"), text, kind);

// ---- rendering ----
function trust(expected) {
  const box = $("trust");
  const set = (cls, text) => { box.className = "trust " + cls; box.textContent = text; box.hidden = !chain.length; };
  if (sig.state === "invalid") return set("bad", `Signature invalid: ${sig.reason}.`);
  if (sig.state === "unsigned") return set("warn", "Unsigned. An unsigned chain cannot show who made it, and a careful editor could rebuild it. Exporting signs it with your author key.");
  if (!expected) return set("warn", `Signed by key ${sig.fingerprint}. To confirm who that is, enter the author's key under "Check a chain someone sent you".`);
  return plain(sig.fingerprint) === expected
    ? set("ok", `Signed by key ${sig.fingerprint}, which matches the author's key you entered.`)
    : set("bad", `Signed by a different key (${sig.fingerprint}) than the one you entered. Do not treat this as the author's chain.`);
}

function render() {
  const expected = plain($("expect").value);
  const linksBroken = !check.ok;
  const broken = linksBroken || sig.state === "invalid";
  const wrongAuthor = !broken && sig.state === "valid" && expected && plain(sig.fingerprint) !== expected;
  const badge = $("status");
  badge.className = "badge " + (!chain.length ? "idle" : broken || wrongAuthor ? "bad" : "ok");
  badge.textContent = !chain.length ? "EMPTY" : broken ? "CHAIN BROKEN" : wrongAuthor ? "WRONG AUTHOR" : "CHAIN INTACT";
  $("count").textContent = chain.length ? `${chain.length} card${chain.length === 1 ? "" : "s"} sealed` : "";
  $("empty").hidden = chain.length > 0;
  $("export").disabled = !chain.length || broken;
  $("seal").disabled = broken;
  trust(expected);

  const bad = check.results.find((r) => !r.ok);
  const box = $("alert");
  box.hidden = !(bad || sig.state === "invalid");
  if (bad) {
    const kind = bad.reason.startsWith("link") ? "Link broken" : "Tamper detected";
    const exp = h("code", "", short(bad.expected)); exp.title = bad.expected;
    const got = h("code", "", short(bad.found)); got.title = bad.found;
    box.replaceChildren(h("strong", "", `${kind} at card #${bad.index + 1}: `), `${bad.reason}. Expected `, exp, ", found ", got, ". Adding new cards is paused until the chain is fixed.");
  } else if (sig.state === "invalid") {
    box.replaceChildren(h("strong", "", "Signature invalid: "), `${sig.reason}. Adding new cards is paused.`);
  }

  const list = $("cards");
  list.replaceChildren();
  chain.forEach((c, i) => {
    const res = check.results[i] || { ok: true };
    const good = c.status === "matched" || c.status === "verified";
    const top = h("div", "top", h("span", "num", `#${i + 1}`), h("span", "badge " + (good ? "ok" : "warn"), LABEL[c.status] || String(c.status).toUpperCase()), h("span", "rid", `receipt #${(c.hash || "").slice(0, 8)}`), [c.author, c.published].filter(Boolean).join(" · "));
    const meta1 = h("div", "meta");
    const href = safeLink(c.url);
    if (href) { const a = h("a", "", c.title || c.url); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; meta1.append(a); }
    else if (c.title) meta1.append(h("span", "", c.title));
    const arch = safeLink(c.archive);
    if (arch) { const a = h("a", "", "archived copy"); a.href = arch; a.target = "_blank"; a.rel = "noopener noreferrer"; meta1.append(a); }
    const li = h("li", "card" + (res.ok ? "" : " bad"), top, h("strong", "claim", c.claim), h("blockquote", "", c.quote), meta1, h("div", "meta hashes", hashEl("hash", c.hash), hashEl("prev", c.prev)));
    if (!res.ok) li.append(h("div", "fail", `Failed: ${res.reason}`));
    list.append(li);
    if (i < chain.length - 1) list.append(h("li", "link" + (check.results[i + 1] && !check.results[i + 1].ok ? " bad" : "")));
  });
}

async function refresh() {
  check = await verifyChain(chain);
  sig = await verifySignature({ cards: chain, ...(meta || {}) });
  render();
}

function liveCheck() {
  const quote = $("quote").value, source = $("source").value, box = $("live");
  const set = (cls, text) => { box.className = "live " + cls; box.textContent = text; };
  if (!quote.trim()) return set("idle", "Enter a quote to see its verification status.");
  if (!source.trim()) return set("warn", "Not checked: with no source text, the quote can't be matched.");
  const r = quoteInSource(quote, source);
  r.ok ? set("ok", "Quote matched: it appears word for word in the text you supplied. This does not show the source itself is true.") : set("bad", `Not found in the supplied text: “${r.missing}”`);
}

async function loadChain(data, label) {
  const cards = Array.isArray(data) ? data : data?.cards;
  if (!Array.isArray(cards) || !cards.every((c) => c && typeof c === "object" && typeof c.hash === "string")) return flash("That is not a valid chain file.", "bad");
  if (chain.length && !confirm("Loading replaces the chain shown here. Export it first if you want to keep it. Continue?")) return;
  chain = cards;
  meta = !Array.isArray(data) && data.head && data.author ? { author: data.author, head: data.head } : null;
  persist(); await refresh();
  flash(`Loaded ${label}.`, "ok");
}
async function readFile(file) {
  if (!file) return;
  try { await loadChain(JSON.parse(await file.text()), file.name); } catch { flash("That file is not valid JSON.", "bad"); }
  $("file").value = "";
}

// Exports the chain. Unchanged signed chains keep their original signature; anything else is signed with this browser's key.
async function buildExport() {
  let header = meta;
  const last = chain[chain.length - 1];
  if (!header || header.head.hash !== last.hash || header.head.count !== chain.length) {
    header = await signChain(chain, await keyPromise);
    meta = header; persist(); await refresh();
  }
  return { format: FORMAT, author: header.author, head: header.head, cards: chain };
}

// ---- events ----
FORM.forEach((k) => $(k).addEventListener("input", liveCheck));
$("expect").addEventListener("input", render);
$("details").addEventListener("change", (e) => $("chainPanel").classList.toggle("details", e.target.checked));

$("seal").addEventListener("click", async () => {
  const f = Object.fromEntries(FORM.map((k) => [k, $(k).value]));
  try {
    const card = await sealCard({ ...f, sourceText: f.source }, chain[chain.length - 1] ?? null);
    chain.push(card); meta = null; persist(); await refresh();
    FORM.forEach((k) => ($(k).value = ""));
    liveCheck();
    say($("sealMsg"), `Sealed as ${LABEL[card.status].toLowerCase()}. Receipt #${card.hash.slice(0, 8)}.`, "ok");
  } catch (err) { say($("sealMsg"), err.message, "bad"); }
});

$("sampleGood").addEventListener("click", () => loadChain(structuredClone(SAMPLE), "the intact sample"));
$("sampleBad").addEventListener("click", () => {
  const data = structuredClone(SAMPLE);
  data.cards[2].quote = data.cards[2].quote.replace("18 percent", "48 percent");
  loadChain(data, "the tampered sample");
});
$("clear").addEventListener("click", async () => {
  if (chain.length && confirm("Delete every card from this browser?")) { chain = []; meta = null; persist(); await refresh(); flash("Chain cleared.", "ok"); }
});
$("export").addEventListener("click", async () => {
  const file = await buildExport();
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "verichain.json"; a.click();
  URL.revokeObjectURL(a.href);
});
$("copyKey").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("myKey").textContent); flash("Author key copied.", "ok"); } catch { flash("Select the key and copy it manually.", "bad"); }
});

const drop = $("drop");
["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (ev) => readFile(ev.dataTransfer.files[0]));
$("file").addEventListener("change", (ev) => readFile(ev.target.files[0]));

refresh();

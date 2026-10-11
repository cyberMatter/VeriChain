import { sealCard, verifyChain, quoteInSource } from "./ledger.js";
import { SAMPLE } from "./sample.js";

const $ = (id) => document.getElementById(id);
const STORE = "verichain";
const FORM = ["claim", "quote", "source", "author", "title", "url", "published"];
let chain = [];
let check = { ok: true, results: [] };
try { chain = JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { chain = []; }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(chain)); } catch { /* storage unavailable */ } };
const short = (hash) => (hash && hash.length > 9 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash || "none");

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

function render() {
  const broken = !check.ok;
  const badge = $("status");
  badge.className = "badge " + (!chain.length ? "idle" : broken ? "bad" : "ok");
  badge.textContent = !chain.length ? "EMPTY" : broken ? "CHAIN BROKEN" : "CHAIN INTACT";
  $("count").textContent = chain.length ? `${chain.length} card${chain.length === 1 ? "" : "s"} sealed` : "";
  $("empty").hidden = chain.length > 0;
  $("export").disabled = !chain.length;
  $("seal").disabled = broken;

  const bad = check.results.find((r) => !r.ok);
  const box = $("alert");
  box.hidden = !bad;
  if (bad) {
    const kind = bad.reason.startsWith("link") ? "Link broken" : "Tamper detected";
    const exp = h("code", "", short(bad.expected)); exp.title = bad.expected;
    const got = h("code", "", short(bad.found)); got.title = bad.found;
    box.replaceChildren(h("strong", "", `${kind} at card #${bad.index + 1}: `), `${bad.reason}. Expected `, exp, ", found ", got, ". Adding new cards is paused until the chain is fixed.");
  }

  const list = $("cards");
  list.replaceChildren();
  chain.forEach((c, i) => {
    const res = check.results[i] || { ok: true };
    const top = h("div", "top", h("span", "num", `#${i + 1}`), h("span", "badge " + (c.status === "verified" ? "ok" : "warn"), c.status.toUpperCase()), [c.author, c.published].filter(Boolean).join(" · "));
    const meta = h("div", "meta");
    const href = safeLink(c.url);
    if (href) { const a = h("a", "", c.title || c.url); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.append(a); }
    else if (c.title) meta.append(h("span", "", c.title));
    meta.append(hashEl("hash", c.hash), hashEl("prev", c.prev));
    const li = h("li", "card" + (res.ok ? "" : " bad"), top, h("strong", "claim", c.claim), h("blockquote", "", c.quote), meta);
    if (!res.ok) li.append(h("div", "fail", `Failed: ${res.reason}`));
    list.append(li);
    if (i < chain.length - 1) list.append(h("li", "link" + (check.results[i + 1] && !check.results[i + 1].ok ? " bad" : "")));
  });
}

async function refresh() { check = await verifyChain(chain); render(); }

function flash(text, kind = "ok") { say($("flash"), text, kind); }

function liveCheck() {
  const quote = $("quote").value, source = $("source").value, box = $("live");
  const set = (cls, text) => { box.className = "live " + cls; box.textContent = text; };
  if (!quote.trim()) return set("idle", "Enter a quote to see its verification status.");
  if (!source.trim()) return set("warn", "Unverified: with no source text, the quote can't be checked.");
  const r = quoteInSource(quote, source);
  r.ok ? set("ok", "Verified: the quote appears word for word in the source.") : set("bad", `Not found in the source: “${r.missing}”`);
}

async function loadChain(data, label) {
  const cards = Array.isArray(data) ? data : data?.cards;
  if (!Array.isArray(cards) || !cards.every((c) => c && typeof c === "object" && typeof c.hash === "string")) return flash("That is not a valid chain file.", "bad");
  if (chain.length && !confirm("Loading replaces the chain shown here. Export it first if you want to keep it. Continue?")) return;
  chain = cards; persist(); await refresh();
  flash(`Loaded ${label}.`, "ok");
}
async function readFile(file) {
  if (!file) return;
  try { await loadChain(JSON.parse(await file.text()), file.name); } catch { flash("That file is not valid JSON.", "bad"); }
  $("file").value = "";
}

FORM.forEach((k) => $(k).addEventListener("input", liveCheck));

$("seal").addEventListener("click", async () => {
  const f = Object.fromEntries(FORM.map((k) => [k, $(k).value]));
  try {
    const card = await sealCard({ ...f, sourceText: f.source }, chain[chain.length - 1] ?? null);
    chain.push(card); persist(); await refresh();
    FORM.forEach((k) => ($(k).value = ""));
    liveCheck();
    say($("sealMsg"), `Sealed as ${card.status}. Receipt #${card.hash.slice(0, 8)}.`, "ok");
  } catch (err) { say($("sealMsg"), err.message, "bad"); }
});

$("sampleGood").addEventListener("click", () => loadChain(structuredClone(SAMPLE), "the intact sample"));
$("sampleBad").addEventListener("click", () => {
  const data = structuredClone(SAMPLE);
  data.cards[1].quote = data.cards[1].quote.replace("18 percent", "48 percent");
  loadChain(data, "the tampered sample");
});
$("clear").addEventListener("click", async () => {
  if (chain.length && confirm("Delete every card from this browser?")) { chain = []; persist(); await refresh(); flash("Chain cleared.", "ok"); }
});
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ format: "evidence-chain/1", cards: chain }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "verichain.json"; a.click();
  URL.revokeObjectURL(a.href);
});

const drop = $("drop");
["dragenter", "dragover"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (ev) => readFile(ev.dataTransfer.files[0]));
$("file").addEventListener("change", (ev) => readFile(ev.target.files[0]));

refresh();App

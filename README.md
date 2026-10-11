# Evidence Chain

> **Every claim gets a receipt.**

Evidence Chain is a free, zero-dependency, in-browser tool that seals evidence cards (claim, quote, and source) into a tamper-evident cryptographic chain. If anyone edits a quote, swaps a number, deletes a card, or reorders the chain, the sequence breaks and the tool pinpointing exactly which card failed verification.

Built by a student debater in Doha, Qatar, Evidence Chain addresses the fundamental challenge of digital citation: **trust in information is only as strong as our ability to verify it.**

---

## 🎯 The Problem

Statistics get shortened, quotes get reworded, and evidence cards get quietly edited between the researcher who finds them and the audience that consumes them. 
* In competitive debate, this practice is known as **misquoting** or **card clipping**.
* In public life and media, it is a primary driver of **misinformation**.

Because manual verification is slow and tedious, most readers either trust citations blindly or dismiss them entirely. Evidence Chain makes evidence verification instant, transparent, and mathematically foolproof.

---

## ✨ What It Does

1. **Quote Verification:** Paste a quote alongside its full source passage. Evidence Chain confirms the quote appears word-for-word (bracketed cuts `[...]` in order are supported). If there is a misquote, the tool refuses to issue a receipt.
2. **Cryptographic Sealing:** Cards are sealed using SHA-256 hashing and cryptographically linked to the preceding card's hash—functioning like a lightweight, local-first blockchain with no network, tokens, or servers required.
3. **Sharing & Auditability:** Export the chain as a lightweight `.json` file. Anyone can drop the file into the web UI or run `node verify.mjs` via the CLI to instantly check if the chain remains intact.

> **Status Badges:** Cards are explicitly marked **`verified`** (quote confirmed against supplied source text) or **`unverified`** (no source text supplied), ensuring complete audit transparency.

---

## 🚀 Quick Start

Because the web application relies on native ES modules, serve the directory over HTTP rather than opening `index.html` directly:

```bash
# Clone the repository
git clone [https://github.com/YOUR-USERNAME/evidence-chain.git](https://github.com/YOUR-USERNAME/evidence-chain.git)
cd evidence-chain

# Start a local web server
python -m http.server 8000

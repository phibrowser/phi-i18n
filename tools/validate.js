#!/usr/bin/env node
// Validates the translation catalog. Self-sufficient: everything is derived
// from the English sections under source/, no external data needed.
//
// Checks (blocking):
//   - source/*.json: valid JSON, every entry has a non-empty message and
//     description, keys match ^[a-z][a-z0-9_]*$
//   - each locale file: valid JSON, no keys unknown to the English source,
//     every entry has a non-empty message, placeholder set identical to the
//     English source
// Reports (non-blocking): per-locale completion percentage.

'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'translations');
const SRC = path.join(__dirname, '..', 'source');
const LOCALES = ['de', 'es', 'fr', 'ja', 'ko', 'nl', 'zh-Hans', 'zh-Hant'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;

// Placeholder syntaxes that can appear in source strings. Native syntax is
// preserved per string, so all families are matched.
//
// ORDER MATTERS. Each pattern consumes what it matches before the next one
// runs, so a broader form can never re-match inside a narrower one. The case
// this exists for: {{name}} must be taken whole, otherwise the single-brace
// pattern below matches its inner {name} and a translation that writes one
// brace where the source has two compares equal and passes. It would then not
// interpolate at runtime and the user would see the literal placeholder text.
const PLACEHOLDER_PATTERNS = [
  /<ph name="[A-Za-z0-9_]+"\/>/g, // Chromium grd ph tokens

  /\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g, // {{name}}  (i18next interpolation) -- must precede {name}
  /<\/?[A-Za-z0-9][A-Za-z0-9_]*\s*\/?>/g, // <key/> <b> </b> <0>  (i18next <Trans> inline markup)
  /\$[A-Za-z][A-Za-z0-9_]*\$/g, // $NAME$  (WebExtension named)
  /\$[1-9]/g, // $1..$9  (Chromium positional)
  /%(?:\d+\$)?(?:l{1,2}|h{1,2}|z)?[@diouxXfFeEgGaAcsp]/g, // %@ %d %1$@ %lld  (printf / ObjC)
  /\{[A-Za-z][A-Za-z0-9_]*\}/g, // {name}  (ICU-style)
];

// Separator used when comparing placeholder sets. Must be a character that
// cannot occur inside a placeholder, so that ["$1", "$2"] never compares equal
// to ["$12"]. Written as an escape on purpose: an earlier version embedded a
// literal NUL byte here, which made git, grep and ripgrep treat this file as
// binary and would have silently degraded to "" if any editor normalised it.
const SEP = '\u0000';

function placeholders(message) {
  let rest = message.replace(/%%/g, '');
  const found = [];
  for (const re of PLACEHOLDER_PATTERNS) {
    const m = rest.match(re);
    if (m) {
      found.push(...m);
      // Blank out what was matched so a later, broader pattern cannot claim
      // part of it. A space, not '', so removal never glues two fragments
      // into something that looks like a placeholder.
      rest = rest.replace(re, ' ');
    }
  }
  return found.sort();
}

function loadJson(file, errors, base) {
  const p = path.join(base || DIR, file);
  if (!fs.existsSync(p)) {
    errors.push(`${file}: file is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON (${e.message})`);
    return null;
  }
}

const errors = [];

const en = {};
const sections = fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
for (const f of sections) {
  const part = loadJson(f, errors, SRC);
  if (part) Object.assign(en, part);
}
if (!en) {
  console.error(errors.join('\n'));
  process.exit(1);
}

for (const [key, entry] of Object.entries(en)) {
  if (!KEY_RE.test(key)) {
    errors.push(`source: key "${key}" does not match ${KEY_RE}`);
  }
  if (!entry || typeof entry.message !== 'string' || entry.message.length === 0) {
    errors.push(`source: "${key}" needs a non-empty "message"`);
  }
  if (!entry || typeof entry.description !== 'string' || entry.description.trim().length === 0) {
    errors.push(`source: "${key}" needs a non-empty "description"`);
  }
}

const enKeys = new Set(Object.keys(en));
const stats = [];

for (const locale of LOCALES) {
  const ldir = path.join(DIR, locale);
  const data = {};
  if (!fs.existsSync(ldir)) { errors.push(`translations/${locale}/: directory missing`); continue; }
  for (const f of fs.readdirSync(ldir).filter((x) => x.endsWith('.json'))) {
    if (!sections.includes(f)) { errors.push(`translations/${locale}/${f}: unknown section (no matching source file)`); continue; }
    const part = loadJson(path.join(locale, f), errors);
    if (part) Object.assign(data, part);
  }

  let translated = 0;
  for (const [key, entry] of Object.entries(data)) {
    if (!enKeys.has(key)) {
      errors.push(`${locale}: unknown key "${key}" (not present in the English source)`);
      continue;
    }
    if (!entry || typeof entry.message !== 'string' || entry.message.length === 0) {
      errors.push(`${locale}: "${key}" needs a non-empty "message"`);
      continue;
    }
    const want = placeholders(en[key].message).join(SEP);
    const got = placeholders(entry.message).join(SEP);
    if (want !== got) {
      errors.push(
        `${locale}: "${key}" placeholder mismatch: ` +
          `expected [${placeholders(en[key].message).join(', ')}], ` +
          `got [${placeholders(entry.message).join(', ')}]`
      );
      continue;
    }
    translated++;
  }
  const pct = enKeys.size === 0 ? 0 : Math.round((translated / enKeys.size) * 100);
  stats.push(`  ${locale.padEnd(8)} ${String(translated).padStart(4)}/${enKeys.size}  (${pct}%)`);
}

console.log(`Source strings: ${enKeys.size}`);
console.log('Completion:');
console.log(stats.join('\n'));

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  console.error(errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}
console.log('\nAll checks passed.');

import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES } from "../src/countries.ts";
import { DIAL_CODES, dialCodeFor, phoneCcOptions, phoneDisplayName } from "../src/dial-codes.ts";

test("every country has a numeric dial code", () => {
  assert.equal(Object.keys(DIAL_CODES).length, COUNTRIES.length);
  for (const { code } of COUNTRIES) assert.match(DIAL_CODES[code] ?? "", /^\d{1,4}$/, code);
});

test("dial code spot checks", () => {
  assert.equal(dialCodeFor("TH"), "66");
  assert.equal(dialCodeFor("us"), "1");
  assert.equal(dialCodeFor("GB"), "44");
  assert.equal(dialCodeFor("JP"), "81");
  assert.equal(dialCodeFor("DE"), "49");
  assert.equal(dialCodeFor("IN"), "91");
  assert.equal(dialCodeFor("BR"), "55");
  assert.equal(dialCodeFor("AU"), "61");
  assert.equal(dialCodeFor("ZZ"), null);
  assert.equal(dialCodeFor(null), null);
});

test("phone dropdown labels country with code and prefers the exact match", () => {
  const html = phoneCcOptions("US", "1");
  assert.equal((html.match(/<option /g) || []).length, COUNTRIES.length);
  assert.match(html, /<option value="1" data-country="US" selected>United States \(\+1\)<\/option>/);
  assert.doesNotMatch(html, /data-country="AG" selected/);
  const thai = phoneCcOptions("TH", "66");
  assert.match(thai, /<option value="66" data-country="TH" selected>Thailand \(\+66\)<\/option>/);
  // unknown country with a known dial falls back to its first entry
  const gb = phoneCcOptions("XX", "44");
  assert.match(gb, /data-country="GG" selected>Guernsey \(\+44\)/);
  // unknown everything falls back to US
  const us = phoneCcOptions("XX", null);
  assert.match(us, /data-country="US" selected>/);
});

test("phone dropdown shortens long country names so the box stays narrow", () => {
  assert.equal(phoneDisplayName("South Georgia and the South Sandwich Islands"), "South Georgia");
  assert.equal(phoneDisplayName("Congo, Democratic Republic of the"), "DR Congo");
  assert.equal(phoneDisplayName("Thailand"), "Thailand");
  const html = phoneCcOptions("US", "1");
  const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.equal(labels.length, COUNTRIES.length);
  const longest = labels.reduce((a, b) => (a.length >= b.length ? a : b));
  assert.ok(longest.length <= 34, `widest option still too wide: ${longest}`);
  assert.match(html, /Caribbean Netherlands \(\+599\)/);
});

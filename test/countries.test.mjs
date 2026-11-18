import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES, countryOptions, dedupeAddresses, defaultCountryCode, isCountryCode, savedAddressOptions } from "../src/countries.ts";

test("country list covers ISO codes including US, GB, TH", () => {
  assert.ok(COUNTRIES.length >= 240, `expected full ISO list, got ${COUNTRIES.length}`);
  for (const code of ["US", "GB", "TH", "DE", "JP"]) {
    assert.ok(COUNTRIES.some((c) => c.code === code), code);
  }
});

test("geo default honors Cloudflare country header, else US", () => {
  assert.equal(defaultCountryCode("th"), "TH");
  assert.equal(defaultCountryCode("TH"), "TH");
  assert.equal(defaultCountryCode("gb"), "GB");
  assert.equal(defaultCountryCode(null), "US");
  assert.equal(defaultCountryCode(undefined), "US");
  assert.equal(defaultCountryCode(""), "US");
  assert.equal(defaultCountryCode("XX"), "US");
  assert.equal(defaultCountryCode("USA"), "US");
});

test("country code validation accepts only listed codes", () => {
  assert.equal(isCountryCode("US"), true);
  assert.equal(isCountryCode("th"), true);
  assert.equal(isCountryCode("XX"), false);
  assert.equal(isCountryCode("USA"), false);
  assert.equal(isCountryCode(""), false);
  assert.equal(isCountryCode(null), false);
});

test("country dropdown marks the selected code", () => {
  const html = countryOptions("TH");
  assert.match(html, /<option value="TH" selected>Thailand<\/option>/);
  assert.match(html, /<option value="US">United States<\/option>/);
  assert.equal(countryOptions("XX").includes(" selected"), false);
});

test("saved addresses dedupe to most-recent-first distinct entries", () => {
  const payloads = [
    JSON.stringify({ name:"A Person", email:"a@example.com", phone_cc:"1", phone_number:"555", address1:"1 Main", city:"Town", zip:"90000", country:"us", organization:"Acme" }),
    "not-json",
    JSON.stringify({ name:"", email:"b@example.com", address1:"2 Side" }),
    JSON.stringify({ name:"A Person", email:"a@example.com", phone_cc:"1", phone_number:"555", address1:"1 Main", city:"Town", zip:"90000", country:"US" }),
    JSON.stringify({ name:"B Person", email:"b@example.com", phone_cc:"66", phone_number:"81", address1:"9 Soi", city:"BKK", zip:"10100", country:"TH" }),
  ];
  const out = dedupeAddresses(payloads);
  assert.equal(out.length, 2);
  assert.equal(out[0].email, "a@example.com");
  assert.equal(out[0].country, "US");
  assert.equal(out[0].organization, "Acme");
  assert.equal(out[1].email, "b@example.com");
});

test("saved address picker preselects an entry or the new-address row", () => {
  const addresses = dedupeAddresses([
    JSON.stringify({ name:"A Person", email:"a@example.com", address1:"1 Main", city:"Town", zip:"90000", country:"US" }),
  ]);
  const picked = savedAddressOptions(addresses, 0);
  assert.match(picked, /<option value="0" selected>/);
  assert.match(picked, /<option value="new">/);
  const fresh = savedAddressOptions(addresses, -1);
  assert.match(fresh, /<option value="new" selected>/);
});

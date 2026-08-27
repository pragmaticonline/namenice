// Deterministic mock outcomes for the Transfer flow. Any .net domain not
// listed here is treated as a normal eligible transfer (Scenario A).
export const transferScenarios = {
  "locked.net": { eligible: false, reason: "This domain is currently transfer locked." },
  "invalid.net": { eligible: false, reason: "This domain is not currently eligible for transfer." },
  "pending.net": { alreadyPending: true },
};

/** A code of exactly this value deterministically triggers the mock "couldn't verify" failure state, for demoing that path without random behavior. */
export const FAILING_AUTH_CODE = "0000";

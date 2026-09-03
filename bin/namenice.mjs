#!/usr/bin/env node

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const apiUrl = (process.env.NAMENICE_API_URL || "https://www.namenice.net").replace(/\/$/, "");
const apiKey = process.env.NAMENICE_API_KEY;
const orgId = valueAfter("--org") || process.env.NAMENICE_ORG;

if (!apiKey || !orgId) {
  console.error("NAMENICE_API_KEY and --org (or NAMENICE_ORG) are required");
  process.exitCode = 2;
} else if (args[0] === "domains" && args[1] === "list") {
  const response = await fetch(`${apiUrl}/api/v1/domains`, {
    headers: { authorization: `Bearer ${apiKey}`, "x-org": orgId },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(body.error || `Namenice API returned ${response.status}`);
    process.exitCode = 1;
  } else {
    for (const domain of body.domains || []) console.log(`${domain.domain}\t${domain.status}`);
  }
} else if (args[0] === "dns" && args[1] === "add") {
  const domain = args[2];
  const host = valueAfter("--host") || "@";
  const type = valueAfter("--type");
  const value = valueAfter("--value");
  const ttl = Number(valueAfter("--ttl") || 3600);
  if (!domain || !type || !value) {
    console.error("domain, --type and --value are required");
    process.exitCode = 2;
  } else {
    const response = await fetch(`${apiUrl}/api/v1/domains/${encodeURIComponent(domain)}/dns`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "x-org": orgId, "content-type": "application/json" },
      body: JSON.stringify({ host, type, value, ttl }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(body.error || `Namenice API returned ${response.status}`);
      process.exitCode = 1;
    } else {
      console.log(`created DNS Record ${body.id}`);
    }
  }
} else {
  console.error("Usage: namenice domains list --org <id> | namenice dns add <domain> --type <type> --value <value> --org <id>");
  process.exitCode = 2;
}

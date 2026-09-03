export type WebhookEnv = { DB: D1Database };

type WebhookSubscription = {
  id: number;
  url: string;
  events: string;
  secret: string;
};

export type WebhookDeliveryResult = { delivered: number; failed: number };

function subscribed(events: string, event: string): boolean {
  return events.split(",").map((value) => value.trim()).includes(event) ||
    events.split(",").map((value) => value.trim()).includes("*");
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function dispatchWebhooks(
  env: WebhookEnv,
  orgId: number,
  event: string,
  data: Record<string, unknown>,
  send: (request: Request) => Promise<Response> = fetch,
): Promise<WebhookDeliveryResult> {
  const rows = await env.DB.prepare(
    "SELECT id, url, events, secret FROM webhooks WHERE org_id=? AND active=1",
  ).bind(orgId).all<WebhookSubscription>();
  const subscriptions = (rows.results || []).filter((row) => subscribed(row.events, event));
  const body = JSON.stringify({ event, organization_id: orgId, data });
  let delivered = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      const signature = await sign(subscription.secret, body);
      const response = await send(new Request(subscription.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-namenice-event": event,
          "x-namenice-signature": `sha256=${signature}`,
        },
        body,
      }));
      if (response.ok) delivered += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }));

  return { delivered, failed };
}

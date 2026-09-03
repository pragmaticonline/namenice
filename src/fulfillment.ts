import { createContact, registerDomain } from "./dynadot.ts";

type FulfillmentEnv = {
  DB: D1Database;
  DYNADOT_API_KEY?: string;
  DYNADOT_API_SECRET?: string;
  DYNADOT_SANDBOX?: string;
};

export async function fulfillPaidDomain(env: FulfillmentEnv, orgId: number, domain: string): Promise<{ok:true}|{ok:false;error:string}> {
  try {
    const existing = await env.DB.prepare("SELECT status FROM domains WHERE org_id=? AND domain=?").bind(orgId, domain).first<{status:string}>();
    if (existing?.status === "active") return { ok:true };
    const row = await env.DB.prepare("SELECT payload FROM domain_contacts WHERE org_id=? AND domain=? AND contact_type='pending' ORDER BY id DESC LIMIT 1").bind(orgId, domain).first<{payload:string}>();
    if (!row?.payload) return { ok:false, error:"Domain Contact not found" };
    const contact = JSON.parse(row.payload);
    const created = await createContact(env, contact);
    if (!created.ok || !created.data?.contact_id) return { ok:false, error:created.error || "Dynadot contact failed" };
    const contactId = created.data.contact_id;
    const duration = Number(contact.duration || 1);
    const registered = await registerDomain(env, domain, {
      duration,
      registrant_contact_id:contactId,
      admin_contact_id:contactId,
      tech_contact_id:contactId,
      billing_contact_id:contactId,
      privacy:contact.privacy || "full",
    });
    if (!registered.ok) return { ok:false, error:registered.error || "Dynadot registration failed" };
    const now = Math.floor(Date.now()/1000);
    await env.DB.prepare("UPDATE domains SET status='active', expires_at=? WHERE org_id=? AND domain=?").bind(now + duration*365*86400, orgId, domain).run();
    await env.DB.prepare("UPDATE domain_contacts SET contact_type='registrant', dynadot_contact_id=? WHERE org_id=? AND domain=? AND contact_type='pending'").bind(String(contactId), orgId, domain).run();
    return { ok:true };
  } catch (error) {
    return { ok:false, error:String((error as Error).message || error) };
  }
}

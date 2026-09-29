// Starts a Stripe Checkout payment for a signed-in parent.
// Deploy: supabase functions deploy create-checkout
// Secrets: STRIPE_SECRET_KEY, SITE_URL (your GitHub Pages address)
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function portalUrl(requested: unknown): string {
  const site = Deno.env.get("SITE_URL");
  if (site) return new URL("portal", site.endsWith("/") ? site : site + "/").href;
  // No SITE_URL set: accept the page the parent came from, https only (or localhost for testing)
  const u = new URL(String(requested ?? ""));
  if (u.protocol !== "https:" && u.hostname !== "localhost") throw new Error("bad return url");
  u.search = "";
  u.hash = "";
  return u.href;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Who is asking? (the parent's login token)
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = token ? await db.auth.getUser(token) : { data: null };
    const user = userData?.user;
    if (!user) return json({ error: "Please log in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const { data: child } = await db
      .from("children")
      .select("id, full_name, status, parent_id, program:programs(name), rate:program_rates(label, amount_cents)")
      .eq("id", String(body.child_id ?? ""))
      .maybeSingle();

    if (!child || child.parent_id !== user.id) return json({ error: "We could not find that child on your account." }, 404);
    if (!["enrolled", "pending"].includes(child.status)) {
      return json({ error: "Payments are only available for enrolled or pending children." }, 400);
    }

    let amount: number;
    let description: string;
    if (body.kind === "tuition") {
      // deno-lint-ignore no-explicit-any
      const rate = child.rate as any;
      // deno-lint-ignore no-explicit-any
      const program = child.program as any;
      if (!rate) return json({ error: "No tuition rate is set for this child yet. Please contact the office." }, 400);
      amount = rate.amount_cents;
      const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });
      description = `${month} tuition - ${child.full_name} (${program?.name ?? "Program"}, ${rate.label})`;
    } else {
      amount = Math.round(Number(body.amount_cents));
      if (!Number.isInteger(amount) || amount < 100 || amount > 1_000_000) {
        return json({ error: "Please enter an amount between $1 and $10,000." }, 400);
      }
      const note = String(body.description ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Payment";
      description = `${note} - ${child.full_name}`;
    }

    const returnTo = portalUrl(body.return_url);
    const metadata = { parent_id: user.id, child_id: child.id, description: description.slice(0, 480) };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: { currency: "usd", unit_amount: amount, product_data: { name: description.slice(0, 250) } },
      }],
      success_url: `${returnTo}?paid=1`,
      cancel_url: `${returnTo}?canceled=1`,
      metadata,
      payment_intent_data: { description: description.slice(0, 1000), metadata },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout failed", err);
    return json({ error: "Checkout could not start. Please try again or contact the office." }, 500);
  }
});

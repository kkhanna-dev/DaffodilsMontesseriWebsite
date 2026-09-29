// Receives Stripe events and records payments in the database.
// Deploy WITHOUT JWT verification (Stripe cannot send a Supabase login):
//   supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature ?? "",
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("Bad webhook signature", (err as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  // Service role: bypasses row level security, so only this server code can write payments
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") break; // bank payments finish later via async_payment_succeeded
        const md = s.metadata ?? {};
        if (!md.parent_id) break; // not created by our portal
        const { error } = await db.from("payments").upsert({
          parent_id: md.parent_id,
          child_id: md.child_id || null,
          amount_cents: s.amount_total ?? 0,
          currency: s.currency ?? "usd",
          description: md.description ?? "Online payment",
          status: "paid",
          method: "stripe",
          stripe_session_id: s.id,
          stripe_payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
          paid_at: new Date(event.created * 1000).toISOString(),
        }, { onConflict: "stripe_session_id" });
        if (error) throw error;
        break;
      }
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        await db.from("payments").update({ status: "failed" }).eq("stripe_session_id", s.id);
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        if (pi && c.amount_refunded >= c.amount) {
          await db.from("payments").update({ status: "refunded" }).eq("stripe_payment_intent", pi);
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handling failed", err);
    return new Response("Webhook error", { status: 500 }); // Stripe retries
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Real Stripe Dashboard webhooks require a public https:// endpoint, which this
// app doesn't have yet (no domain/HTTPS — see docs/PROJECT-STATUS.md). Until then,
// test locally with the Stripe CLI, which forwards events over plain HTTP:
//   stripe listen --forward-to localhost:3002/api/stripe/webhook
// That command prints a webhook signing secret — use it as STRIPE_WEBHOOK_SECRET
// for local testing.

// Both clients are constructed inside the handler (not at module scope) so this
// route can be imported during `next build`'s page-data collection without the
// env vars below being set yet — they're only needed once a real request hits
// this endpoint.

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Service-role client: used ONLY in this file. Stripe calls this endpoint
  // server-to-server with no logged-in user/session, so there's no auth.uid()
  // for RLS to key off — the service role is the standard way to let a trusted
  // backend call bypass RLS for exactly this case. Every other route in this app
  // keeps using the cookie-based, RLS-respecting session pattern.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error('Missing stripe-signature header');
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${e?.message}` }, { status: 400 });
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const newStatus = event.type === 'invoice.paid' ? 'paid' : 'failed';

    const { error } = await supabaseAdmin
      .from('jobs')
      .update({ payment_status: newStatus })
      .eq('stripe_invoice_id', invoice.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

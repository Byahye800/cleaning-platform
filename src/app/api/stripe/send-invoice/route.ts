export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
    let job_id: string | undefined;
    try {
          const body = await request.json();
          job_id = body?.job_id;
    } catch {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

  if (!job_id) {
        return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
    const cookieRecord = Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value]));
    const supabase = createServerSupabaseClient(cookieRecord);

  const {
        data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .limit(1);

  if (roleRows?.[0]?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, client_id, status, service_type, address, scheduled_date')
      .eq('id', job_id)
      .maybeSingle();

  if (jobError) {
        return NextResponse.json({ error: jobError.message }, { status: 500 });
  }
    if (!job) {
          return NextResponse.json({ error: 'Job not found or not authorized' }, { status: 404 });
    }
    if (job.status !== 'completed') {
          return NextResponse.json({ error: 'Job must be marked completed before invoicing.' }, { status: 400 });
    }

  const { data: billing, error: billingError } = await supabase
      .from('job_billing')
      .select('price, payment_status')
      .eq('job_id', job.id)
      .maybeSingle();

  if (billingError) {
        return NextResponse.json({ error: billingError.message }, { status: 500 });
  }
    if (!billing) {
          return NextResponse.json({ error: 'No billing record found for this job.' }, { status: 404 });
    }
    if (billing.price == null) {
          return NextResponse.json({ error: 'Job needs a price set before invoicing.' }, { status: 400 });
    }
    if (billing.payment_status !== 'unpaid' && billing.payment_status !== 'failed') {
          return NextResponse.json(
            { error: `Job payment_status is already '${billing.payment_status}'.` },
            { status: 400 }
                );
    }

  const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, contact_email, stripe_customer_id')
      .eq('id', job.client_id)
      .maybeSingle();

  if (clientError) {
        return NextResponse.json({ error: clientError.message }, { status: 500 });
  }
    if (!client) {
          return NextResponse.json({ error: 'Client not found or not authorized' }, { status: 404 });
    }
    if (!client.contact_email) {
          return NextResponse.json({ error: 'Client has no contact_email on file.' }, { status: 400 });
    }

  const { data: claimedRows, error: claimError } = await supabase
      .from('job_billing')
      .update({ payment_status: 'invoiced' })
      .eq('job_id', job.id)
      .in('payment_status', ['unpaid', 'failed'])
      .select('job_id');

  if (claimError) {
        return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
    if (!claimedRows || claimedRows.length === 0) {
          return NextResponse.json(
            { error: 'This job is already being invoiced or has already been invoiced.' },
            { status: 409 }
                );
    }

  try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        let customerId = client.stripe_customer_id;

      if (!customerId) {
              const customer = await stripe.customers.create(
                {
                            email: client.contact_email,
                            name: client.name,
                },
                { idempotencyKey: `customer-create-${client.id}` }
                      );
              customerId = customer.id;

          const { error: updateClientError } = await supabase
                .from('clients')
                .update({ stripe_customer_id: customerId })
                .eq('id', client.id);

          if (updateClientError) throw updateClientError;
      }

      const invoice = await stripe.invoices.create(
        {
                  customer: customerId,
                  collection_method: 'send_invoice',
                  currency: 'gbp',
                  days_until_due: 14,
                  auto_advance: false,
        },
        { idempotencyKey: `invoice-create-${job.id}` }
            );

      await stripe.invoiceItems.create(
        {
                  customer: customerId,
                  invoice: invoice.id,
                  amount: Math.round(Number(billing.price) * 100),
                  currency: 'gbp',
                  description: `${job.service_type ?? 'Cleaning service'} ${job.address} (${job.scheduled_date ?? 'date TBC'})`,
        },
        { idempotencyKey: `invoice-item-${job.id}` }
            );

      const finalized = await stripe.invoices.finalizeInvoice(
              invoice.id,
        {},
        { idempotencyKey: `invoice-finalize-${job.id}` }
            );
        await stripe.invoices.sendInvoice(finalized.id, {}, { idempotencyKey: `invoice-send-${job.id}` });

      const { data: updatedRows, error: updateJobError } = await supabase
          .from('job_billing')
          .update({ stripe_invoice_id: finalized.id, invoiced_at: new Date().toISOString() })
          .eq('job_id', job.id)
          .select('job_id');

      if (updateJobError) throw updateJobError;
        if (!updatedRows || updatedRows.length === 0) {
                throw new Error('Job billing update did not affect any rows (check admin permissions).');
        }

      const { error: logError } = await supabase.from('activity_log').insert({
              actor_id: user.id,
              action: 'invoice.sent',
              entity_type: 'job',
              entity_id: job.id,
      });
        if (logError) {
                console.error(`[send-invoice] Failed to write activity_log for job ${job.id}: ${logError.message}`);
        }

      return NextResponse.json({ success: true, stripe_invoice_id: finalized.id });
  } catch (e: any) {
        await supabase.from('job_billing').update({ payment_status: 'failed' }).eq('job_id', job.id);
        return NextResponse.json({ error: e?.message ?? 'Failed to send invoice' }, { status: 500 });
  }
}

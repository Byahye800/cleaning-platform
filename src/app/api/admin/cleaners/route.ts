export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/adminAuth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { cleanerError, cleanerErrorStatus, jsonNoStore, mapCleanerDbError } from '@/lib/cleanerErrors';

// POST /api/admin/cleaners
// Body (JSON): {
//   name: string, email: string, hourly_rate: number,        -- required
//   user_id?: string (uuid), phone?: string, dbs_status?: string,
//   dbs_check_date?: string (YYYY-MM-DD), emergency_contact?: string,
//   skills?: string[], notes?: string                        -- optional
// }
//
// Calls public.admin_create_cleaner (staging-verified this session; see
// src/lib/cleanerErrors.ts for the pending migration-file renumbering
// note -- it must be committed as 0031, not 0030). The RPC is SECURITY
// INVOKER and independently re-derives auth.uid() and the caller's admin
// role from the session itself -- it does not trust anything this route
// asserts about the caller. That is why this route calls it through the
// session-scoped client (createServerSupabaseClient(), cookie/JWT-based),
// never createSupabaseAdminClient() (service-role, no user session --
// auth.uid() would resolve to NULL inside the function body and every
// call would fail with 'not authenticated').
//
// user_id is accepted here (create only) because the existing
// shell-profile onboarding workflow requires attaching a pre-existing
// auth user to a new cleaner row in some flows. It is never accepted on
// update -- see [id]/route.ts.
//
// The RPC performs its own insert into cleaner_pay_rates and its own
// activity_log write ('cleaner.created') inside the same transaction as
// the cleaners insert -- this route does not duplicate that audit write.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DBS_STATUSES = new Set(['pending', 'clear', 'flagged', 'expired']);

const ALLOWED_KEYS = new Set([
    'name',
    'email',
    'hourly_rate',
    'user_id',
    'phone',
    'dbs_status',
    'dbs_check_date',
    'emergency_contact',
    'skills',
    'notes',
  ]);

export async function POST(request: NextRequest) {
    const admin = await requireAdmin();
    if (!admin.ok) {
          return jsonNoStore(cleanerError(admin.code, admin.message), cleanerErrorStatus(admin.code));
    }

  let body: Record<string, unknown>;
    try {
          body = await request.json();
    } catch {
          return jsonNoStore(cleanerError('INVALID_REQUEST', 'Invalid JSON body.'), cleanerErrorStatus('INVALID_REQUEST'));
    }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return jsonNoStore(cleanerError('INVALID_REQUEST', 'Request body must be a JSON object.'), 400);
  }

  const unknownKeys = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknownKeys.length > 0) {
          return jsonNoStore(cleanerError('INVALID_REQUEST', `Unknown field(s): ${unknownKeys.join(', ')}.`), 400);
    }

  // --- required fields ---
  const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
          return jsonNoStore(cleanerError('INVALID_REQUEST', 'name is required.'), 400);
    }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
          return jsonNoStore(cleanerError('INVALID_REQUEST', 'A valid email address is required.'), 400);
    }

  // hourly_rate must be an actual JSON number, finite, > 0. Any other
  // JSON type (including an empty string) is rejected outright -- never
  // coerced to 0.
  if (typeof body.hourly_rate !== 'number' || !Number.isFinite(body.hourly_rate)) {
        return jsonNoStore(cleanerError('INVALID_REQUEST', 'hourly_rate is required and must be a number.'), 400);
  }
    const hourlyRate = body.hourly_rate;
    if (hourlyRate <= 0) {
          return jsonNoStore(cleanerError('INVALID_REQUEST', 'hourly_rate must be greater than 0.'), 400);
    }

  // --- optional fields ---
  let userId: string | undefined;
    if (body.user_id !== undefined) {
          if (typeof body.user_id !== 'string' || !UUID_RE.test(body.user_id)) {
                  return jsonNoStore(cleanerError('INVALID_REQUEST', 'user_id must be a valid UUID.'), 400);
          }
          userId = body.user_id;
    }

  let phone: string | undefined;
    if (body.phone !== undefined) {
          if (typeof body.phone !== 'string') {
                  return jsonNoStore(cleanerError('INVALID_REQUEST', 'phone must be a string.'), 400);
          }
          phone = body.phone;
    }

  let dbsStatus: string | undefined;
    if (body.dbs_status !== undefined) {
          if (typeof body.dbs_status !== 'string' || !DBS_STATUSES.has(body.dbs_status)) {
                  return jsonNoStore(
                            cleanerError('INVALID_REQUEST', 'dbs_status must be one of pending, clear, flagged, expired.'),
                            400
                          );
          }
          dbsStatus = body.dbs_status;
    }

  let dbsCheckDate: string | undefined;
    if (body.dbs_check_date !== undefined) {
          if (typeof body.dbs_check_date !== 'string' || !DATE_RE.test(body.dbs_check_date)) {
                  return jsonNoStore(cleanerError('INVALID_REQUEST', 'dbs_check_date must be a YYYY-MM-DD date string.'), 400);
          }
          dbsCheckDate = body.dbs_check_date;
    }

  let emergencyContact: string | undefined;
    if (body.emergency_contact !== undefined) {
          if (typeof body.emergency_contact !== 'string') {
                  return jsonNoStore(cleanerError('INVALID_REQUEST', 'emergency_contact must be a string.'), 400);
          }
          emergencyContact = body.emergency_contact;
    }

  let skills: string[] | undefined;
    if (body.skills !== undefined) {
          if (!Array.isArray(body.skills) || !body.skills.every((s) => typeof s === 'string')) {
                  return jsonNoStore(cleanerError('INVALID_REQUEST', 'skills must be an array of strings.'), 400);
          }
          skills = body.skills;
    }

  let notes: string | undefined;
    if (body.notes !== undefined) {
          if (typeof body.notes !== 'string') {
                  return jsonNoStore(cleanerError('INVALID_REQUEST', 'notes must be a string.'), 400);
          }
          notes = body.notes;
    }

  // Session-scoped client -- required because admin_create_cleaner is
  // SECURITY INVOKER and reads auth.uid() from the calling session.
  const cookieStore = await cookies();
    const cookieRecord = Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value]));
    const supabase = createServerSupabaseClient(cookieRecord);

  const { data, error } = await supabase.rpc('admin_create_cleaner', {
        p_name: name,
        p_email: email,
        p_hourly_rate: hourlyRate,
        p_user_id: userId ?? null,
        p_phone: phone ?? null,
        p_dbs_status: dbsStatus ?? null,
        p_dbs_check_date: dbsCheckDate ?? null,
        p_emergency_contact: emergencyContact ?? null,
        p_skills: skills ?? null,
        p_notes: notes ?? null,
  });

  if (error) {
        console.error(`[admin/cleaners] admin_create_cleaner failed for ${email}:`, error.message);
        const mapped = mapCleanerDbError(error.message);
        return jsonNoStore(cleanerError(mapped.code, mapped.message), cleanerErrorStatus(mapped.code));
  }

  const createdId = (data as { id?: string } | null)?.id ?? 'unknown';
    console.log(`[admin/cleaners] cleaner created: ${createdId} (${email}) by admin ${admin.user.id}`);

  return jsonNoStore({ success: true, cleaner: data }, 201);
}

export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/adminAuth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { cleanerError, cleanerErrorStatus, jsonNoStore, mapCleanerDbError } from '@/lib/cleanerErrors';

// PATCH /api/admin/cleaners/[id]
// Body (JSON): any non-empty subset of {
//   name, email, phone, dbs_status, dbs_check_date, emergency_contact,
//   skills, notes, hourly_rate
// } -- all optional per-call, but only the keys actually supplied are
// changed. user_id, status, invitation_status, onboarding_status are
// never accepted here -- there is no lifecycle-state or account-linkage
// mutation surface on this route by design.
//
// Calls public.admin_update_cleaner (staging-verified this session; see
// src/lib/cleanerErrors.ts for the pending migration-file renumbering
// note). Same session-scoped-client requirement as POST /route.ts -- see
// that file's header comment for why (SECURITY INVOKER RPC, auth.uid()
// must resolve to the real caller).
//
// p_fields is built here strictly from keys that are both present in the
// request body (via hasOwnProperty, so an explicit `null` counts as
// "supplied" but an absent/undefined key does not) AND members of the
// approved allow-list below. The client never supplies p_fields directly
// -- there is no "fields" key in the allow-list itself, so nothing in the
// request body can add an entry to p_fields other than the fixed set of
// per-field branches below.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DBS_STATUSES = new Set(['pending', 'clear', 'flagged', 'expired']);

const ALLOWED_KEYS = new Set([
    'name',
    'email',
    'phone',
    'dbs_status',
    'dbs_check_date',
    'emergency_contact',
    'skills',
    'notes',
    'hourly_rate',
  ]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const admin = await requireAdmin();
    if (!admin.ok) {
          return jsonNoStore(cleanerError(admin.code, admin.message), cleanerErrorStatus(admin.code));
    }

  const { id } = await context.params;
    if (!id || !UUID_RE.test(id)) {
          return jsonNoStore(cleanerError('INVALID_REQUEST', 'A valid cleaner id is required.'), 400);
    }

  let body: Record<string, unknown>;
    try {
          body = await request.json();
    } catch {
          return jsonNoStore(cleanerError('INVALID_REQUEST', 'Invalid JSON body.'), 400);
    }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return jsonNoStore(cleanerError('INVALID_REQUEST', 'Request body must be a JSON object.'), 400);
  }

  const unknownKeys = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknownKeys.length > 0) {
          return jsonNoStore(
                  cleanerError('INVALID_REQUEST', `Unknown or unsupported field(s): ${unknownKeys.join(', ')}.`),
                  400
                );
    }

  const fields: string[] = [];
    const rpcParams: Record<string, unknown> = { p_cleaner_id: id };

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'name must not be blank.'), 400);
        }
        fields.push('name');
      rpcParams.p_name = name;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email || !EMAIL_RE.test(email)) {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'A valid email address is required.'), 400);
        }
        fields.push('email');
        rpcParams.p_email = email;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
        if (typeof body.phone !== 'string') {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'phone must be a string.'), 400);
        }
        fields.push('phone');
        rpcParams.p_phone = body.phone;
  }

  // dbs_status and dbs_check_date accept an explicit empty string (or
  // null) as "clear this field" -- the RPC already supports clearing both
  // (nullif/COALESCE on dbs_status, a plain nullable date column for
  // dbs_check_date), so rejecting '' here would make it impossible for an
  // admin to ever clear a previously-set value through this API. A
  // non-empty value must still pass the normal format/enum check.
  if (Object.prototype.hasOwnProperty.call(body, 'dbs_status')) {
        const raw = body.dbs_status;
        const isClear = raw === null || raw === '';
        if (!isClear && (typeof raw !== 'string' || !DBS_STATUSES.has(raw))) {
                return jsonNoStore(
                          cleanerError(
                                      'INVALID_REQUEST',
                                      'dbs_status must be one of pending, clear, flagged, expired, or empty/null to clear it.'
                                    ),
                          400
                        );
        }
        fields.push('dbs_status');
        rpcParams.p_dbs_status = isClear ? null : raw;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'dbs_check_date')) {
        const raw = body.dbs_check_date;
        const isClear = raw === null || raw === '';
        if (!isClear && (typeof raw !== 'string' || !DATE_RE.test(raw))) {
                return jsonNoStore(
                          cleanerError('INVALID_REQUEST', 'dbs_check_date must be a YYYY-MM-DD date string, or empty/null to clear it.'),
                          400
                        );
        }
        fields.push('dbs_check_date');
        rpcParams.p_dbs_check_date = isClear ? null : raw;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'emergency_contact')) {
        if (typeof body.emergency_contact !== 'string') {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'emergency_contact must be a string.'), 400);
        }
        fields.push('emergency_contact');
        rpcParams.p_emergency_contact = body.emergency_contact;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'skills')) {
        if (!Array.isArray(body.skills) || !body.skills.every((s) => typeof s === 'string')) {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'skills must be an array of strings.'), 400);
        }
        fields.push('skills');
        rpcParams.p_skills = body.skills;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
        if (typeof body.notes !== 'string') {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'notes must be a string.'), 400);
        }
        fields.push('notes');
        rpcParams.p_notes = body.notes;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'hourly_rate')) {
        if (typeof body.hourly_rate !== 'number' || !Number.isFinite(body.hourly_rate)) {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'hourly_rate must be a number.'), 400);
        }
        if (body.hourly_rate <= 0) {
                return jsonNoStore(cleanerError('INVALID_REQUEST', 'hourly_rate must be greater than 0.'), 400);
        }
        fields.push('hourly_rate');
        rpcParams.p_hourly_rate = body.hourly_rate;
  }

  if (fields.length === 0) {
        return jsonNoStore(cleanerError('INVALID_REQUEST', 'At least one editable field must be supplied.'), 400);
  }

  rpcParams.p_fields = fields;

  // Session-scoped client -- required because admin_update_cleaner is
  // SECURITY INVOKER and reads auth.uid() from the calling session.
  const cookieStore = await cookies();
    const cookieRecord = Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value]));
    const supabase = createServerSupabaseClient(cookieRecord);

  const { data, error } = await supabase.rpc('admin_update_cleaner', rpcParams);

  if (error) {
        console.error(`[admin/cleaners/${id}] admin_update_cleaner failed (fields: ${fields.join(',')}):`, error.message);
        const mapped = mapCleanerDbError(error.message);
        return jsonNoStore(cleanerError(mapped.code, mapped.message), cleanerErrorStatus(mapped.code));
  }

  console.log(`[admin/cleaners/${id}] cleaner updated (fields: ${fields.join(',')}) by admin ${admin.user.id}`);

  return jsonNoStore({ success: true, cleaner: data }, 200);
}

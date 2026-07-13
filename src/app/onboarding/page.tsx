'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { mapInvitationDbError } from '@/lib/invitationErrors';
import { color, spacing, radius, font } from '@/lib/theme';

// Stage 2.4 -- onboarding route. Reconstructed post-context-loss from
// STAGE-2-4-DESIGN-SPECIFICATION.md (Sections F, G, H, S) and the three
// already-implemented, already-pushed API routes it calls:
//   POST /api/auth/invitation/finalize  (identity-match hardened, Stage 2.4)
//   POST /api/auth/invitation/status
//   POST /api/onboarding/profile        (save_profile, complete_onboarding)
//   supabase.rpc('accept_account_invitation', { p_invitation_id })
//
// Security posture, per the approved design:
// - Nothing about the invitation, role, or lifecycle state is rendered
//   before the server has verified it. The only pre-verification state is
//   a neutral "Verifying your invitation..." message.
// - Every authorization-relevant decision (identity match, lifecycle
//   status, eligibility) is re-checked server-side by the routes above --
//   this page never trusts its own client-side state as authority, only
//   as a rendering hint. A refresh at any point simply re-runs
//   verification from scratch.
// - restricted -> active is admin-gated (Section S decision (b), confirmed
//   final in Amendment 1 / the already-shipped
//   /api/admin/accounts/activate route). This page never sets status to
//   active itself -- it only ever reaches "submitted, pending review".

type Role = 'cleaner' | 'client';

type PageState =
  | 'verifying'
  | 'invalid'
  | 'session_error'
  | 'identity_mismatch'
  | 'not_pending'
  | 'not_eligible'
  | 'already_completed'
  | 'password_step'
  | 'profile_step'
  | 'submitting'
  | 'success'
  | 'temporary_error';

type StatusResponse = {
  role: Role;
  status: string;
  invitation_status: string;
  onboarding_status: string;
  required_profile_fields_complete: boolean;
};

function mapPasswordError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/session|not authenticated|jwt/i.test(message)) {
    return 'Your session has expired. Please use your invitation link again.';
  }
  if (/rate.?limit/i.test(message)) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (/weak|at least \d+ characters|should contain/i.test(message)) {
    return 'Please choose a stronger password.';
  }
  return 'Could not update your password. Please try again.';
}

export default function OnboardingPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [state, setState] = useState<PageState>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [justSetPassword, setJustSetPassword] = useState(false);

  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [alreadyFieldsComplete, setAlreadyFieldsComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (typeof window === 'undefined') return;

      const params = new URLSearchParams(window.location.search);
      const invitation = params.get('invitation');
      const code = params.get('code');

      if (!invitation) {
        if (!cancelled) {
          setState('invalid');
          setErrorMessage('This invitation link looks incomplete.');
        }
        return;
      }
      if (!cancelled) setInvitationId(invitation);

      // Establish a session: exchange the PKCE code if present, otherwise
      // fall back to any existing session (matches reset-password's
      // precedent dual-path pattern).
      let hasSession = false;
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        hasSession = !exchangeError;
      }
      if (!hasSession) {
        const { data } = await supabase.auth.getSession();
        hasSession = Boolean(data?.session);
      }

      if (!hasSession) {
        if (!cancelled) {
          setState('session_error');
          setErrorMessage("We couldn't verify your invitation. The link may be invalid or expired.");
        }
        return;
      }

      // Server-side finalize: identity-match hardened, idempotent, safe to
      // call on every load.
      let finalizeRes: Response;
      try {
        finalizeRes = await fetch('/api/auth/invitation/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitation_id: invitation }),
        });
      } catch {
        if (!cancelled) {
          setState('temporary_error');
          setErrorMessage('Something went wrong completing your invitation. Please try again.');
        }
        return;
      }

      if (!finalizeRes.ok) {
        const body = await finalizeRes.json().catch(() => null);
        const code2 = body?.error?.code as string | undefined;
        if (!cancelled) {
          if (code2 === 'INVITATION_IDENTITY_MISMATCH') {
            setState('identity_mismatch');
            setErrorMessage("This invitation doesn't match your account.");
          } else if (code2 === 'INVITATION_NOT_FOUND') {
            setState('invalid');
            setErrorMessage("We couldn't find this invitation. It may have been cancelled.");
          } else if (code2 === 'INVITATION_NOT_PENDING') {
            setState('not_pending');
            setErrorMessage(
              'This invitation is no longer active. It may have expired, been cancelled, or already been used. Please contact your administrator for a new invitation.'
            );
          } else if (code2 === 'NOT_AUTHENTICATED') {
            setState('session_error');
            setErrorMessage("We couldn't verify your invitation. The link may be invalid or expired.");
          } else {
            setState('temporary_error');
            setErrorMessage('Something went wrong completing your invitation. Please try again.');
          }
        }
        return;
      }

      // Authoritative lifecycle read.
      let statusRes: Response;
      try {
        statusRes = await fetch('/api/auth/invitation/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitation_id: invitation }),
        });
      } catch {
        if (!cancelled) {
          setState('temporary_error');
          setErrorMessage('Something went wrong loading your account status. Please try again.');
        }
        return;
      }

      if (!statusRes.ok) {
        if (!cancelled) {
          setState('temporary_error');
          setErrorMessage('Something went wrong loading your account status. Please try again.');
        }
        return;
      }

      const statusBody = (await statusRes.json()) as StatusResponse;
      if (cancelled) return;

      setRole(statusBody.role);

      if (statusBody.status !== 'restricted') {
        // active/suspended/disabled -- normally intercepted by proxy.ts
        // before this page's own code runs. Handled here only as
        // defense in depth, never as the primary control.
        setState('already_completed');
        return;
      }

      if (statusBody.onboarding_status === 'submitted' || statusBody.onboarding_status === 'approved') {
        setState('already_completed');
        return;
      }

      setAlreadyFieldsComplete(statusBody.required_profile_fields_complete);
      setState('password_step');
    }

    run().catch(() => {
      if (!cancelled) {
        setState('temporary_error');
        setErrorMessage('Something went wrong. Please try again.');
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSetPassword() {
    setPasswordError(null);
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setJustSetPassword(true);
      setState('profile_step');
    } catch (e: unknown) {
      setPasswordError(mapPasswordError(e));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleCompleteProfile() {
    if (!invitationId || !role) return;
    setErrorMessage(null);
    setState('submitting');

    try {
      // Step 1: save the role-scoped fields, unless they were already
      // complete from a prior partial attempt.
      if (!alreadyFieldsComplete) {
        const fields =
          role === 'cleaner'
            ? { phone: phone.trim(), emergency_contact: emergencyContact.trim() }
            : { address: address.trim(), contact_phone: contactPhone.trim() };

        const saveRes = await fetch('/api/onboarding/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_profile', fields }),
        });
        if (!saveRes.ok) {
          setState('temporary_error');
          setErrorMessage('Something went wrong saving your details. Please try again.');
          return;
        }
      }

      // Step 2: accept the invitation (client-direct RPC, already
      // grant-enabled to `authenticated`, unchanged from Stage 2.2c).
      const { error: acceptError } = await supabase.rpc('accept_account_invitation', {
        p_invitation_id: invitationId,
      });
      if (acceptError) {
        const mapped = mapInvitationDbError(acceptError.message);
        setState('temporary_error');
        setErrorMessage(mapped.message);
        return;
      }

      // Step 3: mark onboarding submitted. Requires invitation_status to
      // now be invite_accepted -- re-verified server-side, not trusted
      // from this client's own view of step 2's success.
      const completeRes = await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_onboarding' }),
      });
      if (!completeRes.ok) {
        setState('temporary_error');
        setErrorMessage('Something went wrong finishing your onboarding. Please try again.');
        return;
      }

      setState('success');
    } catch {
      setState('temporary_error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: color.gray50,
        fontFamily: font.family,
        padding: spacing.lg,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: color.white,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: spacing.xxl,
        }}
      >
        <div style={{ marginBottom: spacing.xl, textAlign: 'center' }}>
          <div
            style={{
              fontWeight: font.weight.heavy,
              fontSize: font.size.xl,
              color: color.navy,
              letterSpacing: '-0.01em',
            }}
          >
            FM Pro Cleaning
          </div>
          <p style={{ marginTop: spacing.sm, color: color.textSecondary, fontSize: font.size.base }}>
            Complete your account setup
          </p>
        </div>

        {state === 'verifying' && (
          <p style={{ color: color.textSecondary, fontSize: font.size.base, textAlign: 'center' }}>
            Verifying your invitation…
          </p>
        )}

        {(state === 'invalid' ||
          state === 'session_error' ||
          state === 'identity_mismatch' ||
          state === 'not_pending' ||
          state === 'not_eligible' ||
          state === 'temporary_error') && (
          <div>
            <div
              style={{
                padding: spacing.md,
                border: '1px solid #fecaca',
                background: '#fff1f2',
                color: color.error,
                borderRadius: radius.md,
                fontSize: font.size.sm,
                marginBottom: spacing.lg,
              }}
            >
              {errorMessage ?? 'Something went wrong. Please try again.'}
            </div>
            <p style={{ color: color.textSecondary, fontSize: font.size.sm }}>
              If this problem continues, please contact your administrator.
            </p>
          </div>
        )}

        {state === 'already_completed' && (
          <div
            style={{
              padding: spacing.md,
              border: '1px solid #bfdbfe',
              background: '#eff6ff',
              color: '#1e40af',
              borderRadius: radius.md,
              fontSize: font.size.sm,
            }}
          >
            You&apos;ve already completed this step. Your account is set up — if it&apos;s not active yet, an
            administrator still needs to review it.
          </div>
        )}

        {state === 'password_step' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            <p style={{ color: color.textSecondary, fontSize: font.size.sm }}>
              First, set a password for your account.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>
                Password
              </span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                style={inputStyle}
                autoComplete="new-password"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>
                Confirm password
              </span>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                style={inputStyle}
                autoComplete="new-password"
              />
            </label>

            {passwordError && (
              <div
                style={{
                  padding: spacing.md,
                  border: '1px solid #fecaca',
                  background: '#fff1f2',
                  color: color.error,
                  borderRadius: radius.md,
                  fontSize: font.size.sm,
                }}
              >
                {passwordError}
              </div>
            )}

            <button
              onClick={handleSetPassword}
              disabled={passwordBusy || !password || !confirmPassword}
              style={buttonStyle}
            >
              {passwordBusy ? 'Saving…' : 'Continue'}
            </button>
          </div>
        )}

        {state === 'profile_step' && role && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
            {justSetPassword && (
              <div
                style={{
                  padding: spacing.md,
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: color.success,
                  borderRadius: radius.md,
                  fontSize: font.size.sm,
                }}
              >
                Password set.
              </div>
            )}

            {alreadyFieldsComplete ? (
              <p style={{ color: color.textSecondary, fontSize: font.size.sm }}>
                Your profile details are already on file. Click below to finish.
              </p>
            ) : role === 'cleaner' ? (
              <>
                <p style={{ color: color.textSecondary, fontSize: font.size.sm }}>
                  A few more details before you get started.
                </p>
                <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>
                    Phone number
                  </span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} autoComplete="tel" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>
                    Emergency contact
                  </span>
                  <input
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </>
            ) : (
              <>
                <p style={{ color: color.textSecondary, fontSize: font.size.sm }}>
                  A few more details before you get started.
                </p>
                <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>
                    Address
                  </span>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <span style={{ fontSize: font.size.sm, color: color.textSecondary, fontWeight: font.weight.medium }}>
                    Contact phone
                  </span>
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    style={inputStyle}
                    autoComplete="tel"
                  />
                </label>
              </>
            )}

            {errorMessage && (
              <div
                style={{
                  padding: spacing.md,
                  border: '1px solid #fecaca',
                  background: '#fff1f2',
                  color: color.error,
                  borderRadius: radius.md,
                  fontSize: font.size.sm,
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              onClick={handleCompleteProfile}
              disabled={
                !alreadyFieldsComplete &&
                (role === 'cleaner' ? !phone.trim() || !emergencyContact.trim() : !address.trim() || !contactPhone.trim())
              }
              style={buttonStyle}
            >
              Finish
            </button>
          </div>
        )}

        {state === 'submitting' && (
          <p style={{ color: color.textSecondary, fontSize: font.size.base, textAlign: 'center' }}>
            Submitting…
          </p>
        )}

        {state === 'success' && (
          <div
            style={{
              padding: spacing.md,
              border: '1px solid #bbf7d0',
              background: '#f0fdf4',
              color: color.success,
              borderRadius: radius.md,
              fontSize: font.size.sm,
            }}
          >
            Thanks — your details have been submitted. Your account is now pending administrator review.
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  outline: 'none',
  fontSize: font.size.base,
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: radius.md,
  border: `1px solid ${color.navy}`,
  background: color.navy,
  color: color.textInverse,
  fontWeight: font.weight.medium,
  fontSize: font.size.base,
  cursor: 'pointer',
};

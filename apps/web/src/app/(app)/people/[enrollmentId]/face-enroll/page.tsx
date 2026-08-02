'use client';

// "Register Face Key" — staff-facing face-bio enrollment for one student,
// reached from the Students page's row action menu / drawer quick action.
// Reuses FaceScanner (apps/web/src/app/(app)/attendance/face-scanner.tsx)
// wholesale for camera + face-api.js model loading + descriptor extraction —
// this page only adds the frozen after-capture preview, the descriptor/
// WebGL readout, and the submit-to-enrollment step.
//
// Consent: staff cannot mint a biometric_face consent themselves (RLS
// requires the subject or a guardian with consent authority — see
// consents_insert_self_or_ward, migration 0005) — same constraint the
// existing /attendance enrollment form works under. The guardian grants it
// once from /family ("Grant biometric consent") and reads the resulting
// consent ID out to staff; this page just takes that ID as input, matching
// the existing pattern rather than inventing a new one.

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Info, RefreshCw, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace';
import { FaceScanner, type FaceCaptureMeta } from '../../../attendance/face-scanner';
import { api, type DetailedEnrollment } from '../../types';

// Mirrors module-attendance's FACE_EMBEDDING_DIMENSIONS / FACE_MATCH_THRESHOLD_*
// (packages/modules/attendance/src/service.ts) — hardcoded rather than
// imported since that package pulls in server-only DB code that can't ship
// to a client bundle.
const EMBEDDING_DIMENSIONS = 128;
const MATCH_THRESHOLD_REVIEW = 0.65;
const CAPTURE_FRAME_CLASS = 'max-w-full';

export default function FaceEnrollPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { loading: workspaceLoading, activeOrg } = useWorkspace();
  const orgId = activeOrg?.organizationId ?? null;

  const [enrollment, setEnrollment] = useState<DetailedEnrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentId, setConsentId] = useState('');
  const [captured, setCaptured] = useState<{ embedding: number[] } & FaceCaptureMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!orgId || !enrollmentId) return;
    api<DetailedEnrollment>(`/api/v1/orgs/${orgId}/enrollments/${enrollmentId}?detailed=1`)
      .then(setEnrollment)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load this student.'));
  }, [orgId, enrollmentId]);

  async function register() {
    if (!orgId || !captured || !consentId.trim()) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/attendance/face-enrollments`, {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId,
          consentId: consentId.trim(),
          embedding: captured.embedding,
          qualityScore: captured.qualityScore,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Could not register this face — double-check the consent ID is correct and still active.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (workspaceLoading || (!enrollment && !loadError)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (loadError || !enrollment) {
    return (
      <div className="p-8">
        <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Back to Students
        </Link>
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">{loadError ?? 'Student not found.'}</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="glass-panel max-w-sm space-y-3 rounded-2xl p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-400" />
          <h1 className="text-lg font-bold text-white">Face key registered</h1>
          <p className="text-sm text-slate-400">
            {enrollment.studentDisplayName}&apos;s face bio is now enrolled for attendance check-in.
          </p>
          <Link href="/people" className="btn-premium inline-block rounded-xl px-4 py-2 text-xs font-bold">
            Back to Students
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Back to Students
      </Link>

      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">
          <Sparkles className="h-3 w-3" /> AI Biometrics Enrollment
        </div>
        <h1 className="text-2xl font-black text-white">Register Face Key: {enrollment.studentDisplayName}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">ID Reference: {(enrollment.rollNumber ?? enrollment.id.slice(0, 8)).toUpperCase()}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Capture panel */}
        <div className="glass-panel space-y-4 rounded-2xl p-5">
          {captured ? (
            <div className="space-y-3">
              <div className="relative w-full overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={captured.frameDataUrl} alt="Captured face" className="aspect-[4/3] w-full scale-x-[-1] object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                  Sample Capture Cached
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCaptured(null)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retake Photo
                </button>
                <button
                  disabled={!consentId.trim() || busy}
                  onClick={register}
                  className="btn-premium flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> {busy ? 'Registering…' : 'Register & Save Profile'}
                </button>
              </div>
              {submitError && <p className="text-xs text-red-400">{submitError}</p>}
            </div>
          ) : (
            <FaceScanner
              frameClassName={CAPTURE_FRAME_CLASS}
              captureLabel="Capture & Extract face landmarks"
              onCapture={(embedding, meta) => setCaptured({ embedding, ...meta })}
            />
          )}

          <div className="border-t border-white/10 pt-3">
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Guardian consent ID</label>
              <ConsentInfoTooltip />
            </div>
            <input
              value={consentId}
              onChange={(e) => setConsentId(e.target.value)}
              placeholder="e.g. 8f14e45f-ceea-4abc-8a2e-7cf9c8e6a1b2"
              className="glass-input w-full max-w-sm rounded-lg px-3 py-1.5 font-mono text-sm"
            />
          </div>
        </div>

        {/* Descriptor specifications panel */}
        <div className="glass-panel space-y-4 rounded-2xl p-5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <ScanFace className="h-3.5 w-3.5" /> Descriptor Specifications
          </p>

          <SpecRow label="Dimensions" value={`${EMBEDDING_DIMENSIONS}-Float Map`} />
          <SpecRow
            label="WebGL Acceleration"
            value={captured ? (captured.webglBackend === 'webgl' ? 'Activated' : captured.webglBackend ?? 'Unavailable') : '—'}
            good={captured?.webglBackend === 'webgl'}
          />

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Computed Descriptor Array</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2.5 font-mono text-[10px] leading-relaxed text-slate-400">
              {captured ? `[${captured.embedding.map((v) => v.toFixed(6)).join(', ')}]` : <span className="italic text-slate-500">Awaiting face capture landmarks…</span>}
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
            <p className="mb-1 font-bold">Important Instructions</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Ensure the student is in a well-lit environment facing the camera directly.</li>
              <li>Remove sunglasses or large hats that obscure the eyes or nose bridge.</li>
              <li>Attendance check-in uses a cosine-similarity match against this descriptor — captures below a {MATCH_THRESHOLD_REVIEW} similarity score will fall back to a manual review queue.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsentInfoTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button onClick={() => setOpen((o) => !o)} className="text-slate-500 hover:text-slate-300" aria-label="What is this?">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="glass-panel absolute left-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-white/10 p-3 text-[11px] leading-relaxed text-slate-400 shadow-2xl">
          Required regardless of age. A guardian grants it once from Family → &quot;Grant biometric consent&quot;; a student 18 or older can instead
          grant their own. Either way, share the resulting ID with you — staff can&apos;t create it directly.
        </div>
      )}
    </div>
  );
}

function SpecRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${good ? 'text-emerald-400' : 'text-slate-300'}`}>{value}</span>
    </div>
  );
}

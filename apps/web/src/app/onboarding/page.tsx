// Placeholder — real onboarding (org creation, join flows) lands in Phase 3
// (Doc 02 §9 provisioning). New identities land here today with zero roles
// and nothing to do yet.
export default function OnboardingPlaceholderPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">You&apos;re signed in.</h1>
        <p className="text-sm text-neutral-500">
          Organization setup (creating or joining a coaching workspace) isn&apos;t built yet — it lands in the next
          phase of the rebuild.
        </p>
      </div>
    </div>
  );
}

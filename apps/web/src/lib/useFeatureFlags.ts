'use client';

// Client hook for reading a Global Settings feature flag (GET
// /api/v1/public/feature-flags — no session required, so this works on both
// anonymous public marketplace pages and authenticated app pages).
//
// Defaults to `true` (fail-open) while loading and if the flag hasn't been
// created in Global Settings yet, so the app keeps behaving exactly as it
// does today until an admin explicitly creates the flag and turns it off —
// matching the EnableAcademyOperation requirement's "true = today's
// behavior" default.

import { useEffect, useState } from 'react';
import { ACADEMY_FEATURE_FLAG_KEY } from './featureFlags';

export function useFeatureFlag(key: string, defaultValue = true): boolean {
  const [enabled, setEnabled] = useState(defaultValue);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/public/feature-flags')
      .then((res) => res.json())
      .then((body) => {
        const flags = body?.data?.flags ?? {};
        if (!cancelled && key in flags) setEnabled(flags[key]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return enabled;
}

export function useAcademyOperationEnabled(): boolean {
  return useFeatureFlag(ACADEMY_FEATURE_FLAG_KEY, true);
}

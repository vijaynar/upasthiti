'use client';

import { useEffect, useState } from 'react';

export interface ServiceArea {
  id: string;
  name: string;
  slug: string;
  city: string;
  display_order: number;
}

// Fetches the fixed Tier 1 service area list once. Shared by the onboarding
// wizard's ServiceAreaPicker and (eventually) Discovery's "near me" filter.
export function useServiceAreas() {
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/public/service-areas')
      .then(res => res.json())
      .then(json => {
        if (!cancelled && json.success) setAreas(json.data.areas);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { areas, loading };
}

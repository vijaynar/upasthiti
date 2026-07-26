'use client';

import { useEffect, useState } from 'react';

export interface Tag {
  id: string;
  subcategory_id: string | null;
  tag_type: 'subject' | 'board' | 'stream' | 'exam';
  name: string;
  slug: string;
  display_order: number;
}

export interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  display_order: number;
  tags: Tag[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  display_order: number;
  coachCount: number;
  academyCount: number;
  subcategories: Subcategory[];
}

// Fetches the categories -> subcategories -> tags taxonomy tree once.
// Shared by CategoryPicker (onboarding/profile editing) and the Discovery
// page filters so both read from the same source of truth.
export function useCategoryTaxonomy() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/public/categories')
      .then(res => res.json())
      .then(json => {
        if (!cancelled && json.success) setCategories(json.data.categories);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { categories, loading };
}

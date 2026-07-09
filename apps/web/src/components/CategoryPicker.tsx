'use client';

import { Check, Star } from 'lucide-react';
import type { Category, Tag } from '@/lib/useCategoryTaxonomy';

export interface CategorySelection {
  categoryId: string | null;
  subcategoryIds: string[];
  primarySubcategoryId: string | null;
  tagIds: string[];
  ageGroups: string[];
  skillLevels: string[];
}

interface CategoryPickerProps {
  categories: Category[];
  value: CategorySelection;
  onChange: (value: CategorySelection) => void;
  theme?: 'light' | 'dark';
}

const AGE_GROUPS = ['Kids', 'Teens', 'Adults'];
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const TAG_TYPE_LABELS: Record<Tag['tag_type'], string> = {
  board: 'Board',
  subject: 'Subjects',
  stream: 'Stream',
  exam: 'Exams',
};

export function CategoryPicker({ categories, value, onChange, theme = 'light' }: CategoryPickerProps) {
  const isDark = theme === 'dark';
  const activeCategory = categories.find(c => c.id === value.categoryId) ?? null;

  const chipClass = (selected: boolean) => `px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-all flex items-center gap-1 ${
    selected
      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
      : (isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200')
  }`;
  const inputClass = `rounded-xl px-3 py-2 text-xs w-full outline-none focus:ring-1 focus:ring-indigo-500 border ${
    isDark ? 'glass-input border-white/10 bg-[#060814] text-slate-200' : 'border-slate-200 bg-white text-slate-800'
  }`;
  const labelClass = 'block text-xs font-medium mb-1';

  function selectCategory(categoryId: string) {
    onChange({
      categoryId,
      subcategoryIds: [],
      primarySubcategoryId: null,
      tagIds: [],
      ageGroups: value.ageGroups,
      skillLevels: value.skillLevels,
    });
  }

  function toggleSubcategory(subcategoryId: string) {
    const isSelected = value.subcategoryIds.includes(subcategoryId);
    let subcategoryIds: string[];
    let primarySubcategoryId = value.primarySubcategoryId;

    if (isSelected) {
      subcategoryIds = value.subcategoryIds.filter(id => id !== subcategoryId);
      if (primarySubcategoryId === subcategoryId) {
        primarySubcategoryId = subcategoryIds[0] ?? null;
      }
    } else {
      subcategoryIds = [...value.subcategoryIds, subcategoryId];
      if (!primarySubcategoryId) primarySubcategoryId = subcategoryId;
    }

    // Drop tags that belonged only to a subcategory that's no longer selected.
    const validTagIds = new Set(
      (activeCategory?.subcategories ?? [])
        .filter(s => subcategoryIds.includes(s.id))
        .flatMap(s => s.tags.map(t => t.id))
    );
    const tagIds = value.tagIds.filter(id => validTagIds.has(id));

    onChange({ ...value, subcategoryIds, primarySubcategoryId, tagIds });
  }

  function setPrimary(subcategoryId: string) {
    onChange({ ...value, primarySubcategoryId: subcategoryId });
  }

  function toggleTag(tagId: string) {
    const tagIds = value.tagIds.includes(tagId)
      ? value.tagIds.filter(id => id !== tagId)
      : [...value.tagIds, tagId];
    onChange({ ...value, tagIds });
  }

  function toggleFromList(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter(x => x !== item) : [...list, item];
  }

  const selectedTags = (activeCategory?.subcategories ?? [])
    .filter(s => value.subcategoryIds.includes(s.id))
    .flatMap(s => s.tags);
  const tagsByType = new Map<Tag['tag_type'], Tag[]>();
  for (const tag of selectedTags) {
    if (!tagsByType.has(tag.tag_type)) tagsByType.set(tag.tag_type, []);
    const bucket = tagsByType.get(tag.tag_type)!;
    if (!bucket.some(t => t.id === tag.id)) bucket.push(tag);
  }

  return (
    <div className="space-y-4">
      {/* Category */}
      <div>
        <label className={labelClass}>Category <span className="text-red-500 ml-1">*</span></label>
        <select
          value={value.categoryId ?? ''}
          onChange={e => selectCategory(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>Select a category…</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
          ))}
        </select>
      </div>

      {/* Subcategories */}
      {activeCategory && (
        <div>
          <label className={`${labelClass} flex items-center justify-between`}>
            <span>Specialties <span className="text-red-500 ml-1">*</span></span>
            <span className={`font-normal text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Click <Star className="w-2.5 h-2.5 inline fill-amber-400 text-amber-400" /> to set primary
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {activeCategory.subcategories.map(sub => {
              const isSelected = value.subcategoryIds.includes(sub.id);
              const isPrimary = value.primarySubcategoryId === sub.id;
              return (
                <span key={sub.id} className={chipClass(isSelected)}>
                  <button type="button" onClick={() => toggleSubcategory(sub.id)} className="flex items-center gap-1">
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    {sub.name}
                  </button>
                  {isSelected && (
                    <button
                      type="button"
                      onClick={() => setPrimary(sub.id)}
                      title={isPrimary ? 'Primary specialty' : 'Set as primary'}
                      className="ml-0.5"
                    >
                      <Star className={`w-3 h-3 ${isPrimary ? 'fill-amber-400 text-amber-400' : 'text-white/40'}`} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tags (Board / Subject / Stream / Exam) — only meaningful once subcategories are picked */}
      {value.subcategoryIds.length > 0 && ['board', 'subject', 'stream', 'exam'].map(type => {
        const tags = tagsByType.get(type as Tag['tag_type']);
        if (!tags || tags.length === 0) return null;
        return (
          <div key={type}>
            <label className={labelClass}>{TAG_TYPE_LABELS[type as Tag['tag_type']]}</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className={chipClass(value.tagIds.includes(tag.id))}>
                  {value.tagIds.includes(tag.id) && <Check className="w-3 h-3 stroke-[3]" />}
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Age Groups */}
      <div>
        <label className={labelClass}>Age Groups Taught</label>
        <div className="flex flex-wrap gap-1.5">
          {AGE_GROUPS.map(ag => (
            <button
              key={ag}
              type="button"
              onClick={() => onChange({ ...value, ageGroups: toggleFromList(value.ageGroups, ag) })}
              className={chipClass(value.ageGroups.includes(ag))}
            >
              {value.ageGroups.includes(ag) && <Check className="w-3 h-3 stroke-[3]" />}
              {ag}
            </button>
          ))}
        </div>
      </div>

      {/* Skill Levels */}
      <div>
        <label className={labelClass}>Skill Levels Coached</label>
        <div className="flex flex-wrap gap-1.5">
          {SKILL_LEVELS.map(sl => (
            <button
              key={sl}
              type="button"
              onClick={() => onChange({ ...value, skillLevels: toggleFromList(value.skillLevels, sl) })}
              className={chipClass(value.skillLevels.includes(sl))}
            >
              {value.skillLevels.includes(sl) && <Check className="w-3 h-3 stroke-[3]" />}
              {sl}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

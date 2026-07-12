'use client';

import { Check, Star } from 'lucide-react';
import type { Category, Tag } from '@/lib/useCategoryTaxonomy';
import { Chip } from '@/components/Chip';

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
                <Chip
                  key={sub.id}
                  theme={theme}
                  selected={isSelected}
                  icon={isSelected ? <Check className="stroke-[3]" /> : undefined}
                  trailing={
                    isSelected && (
                      <button
                        type="button"
                        onClick={() => setPrimary(sub.id)}
                        title={isPrimary ? 'Primary specialty' : 'Set as primary'}
                        style={{ minHeight: 0 }}
                        className="shrink-0"
                      >
                        <Star className={`w-3 h-3 ${isPrimary ? 'fill-amber-400 text-amber-400' : 'text-white/40'}`} />
                      </button>
                    )
                  }
                >
                  <button type="button" onClick={() => toggleSubcategory(sub.id)} style={{ minHeight: 0 }} className="cursor-pointer">
                    {sub.name}
                  </button>
                </Chip>
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
              {tags.map(tag => {
                const isSelected = value.tagIds.includes(tag.id);
                return (
                  <Chip
                    key={tag.id}
                    theme={theme}
                    clickable
                    selected={isSelected}
                    onClick={() => toggleTag(tag.id)}
                    icon={isSelected ? <Check className="stroke-[3]" /> : undefined}
                  >
                    {tag.name}
                  </Chip>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Age Groups */}
        <div>
          <label className={labelClass}>Age Groups Taught</label>
          <div className="flex flex-wrap gap-1.5">
            {AGE_GROUPS.map(ag => {
              const isSelected = value.ageGroups.includes(ag);
              return (
                <Chip
                  key={ag}
                  theme={theme}
                  clickable
                  selected={isSelected}
                  onClick={() => onChange({ ...value, ageGroups: toggleFromList(value.ageGroups, ag) })}
                  icon={isSelected ? <Check className="stroke-[3]" /> : undefined}
                >
                  {ag}
                </Chip>
              );
            })}
          </div>
        </div>

        {/* Skill Levels */}
        <div>
          <label className={labelClass}>Skill Levels Coached</label>
          <div className="flex flex-wrap gap-1.5">
            {SKILL_LEVELS.map(sl => {
              const isSelected = value.skillLevels.includes(sl);
              return (
                <Chip
                  key={sl}
                  theme={theme}
                  clickable
                  selected={isSelected}
                  onClick={() => onChange({ ...value, skillLevels: toggleFromList(value.skillLevels, sl) })}
                  icon={isSelected ? <Check className="stroke-[3]" /> : undefined}
                >
                  {sl}
                </Chip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

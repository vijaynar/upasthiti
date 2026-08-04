import { Activity, Waves, Heart, Brain, Flame, GraduationCap, Trophy, Dumbbell, CircleDot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SportBadgeInfo {
  icon: LucideIcon;
  bgColor: string;
  borderColor: string;
  color: string;
}

export function getSportBadge(name: string): SportBadgeInfo {
  const n = name.toLowerCase();

  // Football / Soccer / FC
  if (n.includes('football') || n.includes('soccer') || n.includes('fc ') || n.includes('fc') || n.includes('kick')) {
    return {
      icon: CircleDot,
      bgColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: 'rgba(16, 185, 129, 0.25)',
      color: '#10b981',
    };
  }

  // Cricket
  if (n.includes('cricket') || n.includes('bat') || n.includes('bowl')) {
    return {
      icon: Activity,
      bgColor: 'rgba(34, 197, 94, 0.12)',
      borderColor: 'rgba(34, 197, 94, 0.25)',
      color: '#22c55e',
    };
  }

  // Swimming
  if (n.includes('swim') || n.includes('dolphin') || n.includes('aqua') || n.includes('pool')) {
    return {
      icon: Waves,
      bgColor: 'rgba(59, 130, 246, 0.12)',
      borderColor: 'rgba(59, 130, 246, 0.25)',
      color: '#3b82f6',
    };
  }

  // Yoga & Fitness
  if (n.includes('yoga') || n.includes('fit') || n.includes('gym') || n.includes('wellness')) {
    return {
      icon: Heart,
      bgColor: 'rgba(168, 85, 247, 0.12)',
      borderColor: 'rgba(168, 85, 247, 0.25)',
      color: '#a855f7',
    };
  }

  // Chess & Mind Sports
  if (n.includes('chess') || n.includes('mind') || n.includes('math') || n.includes('master')) {
    return {
      icon: Brain,
      bgColor: 'rgba(249, 115, 22, 0.12)',
      borderColor: 'rgba(249, 115, 22, 0.25)',
      color: '#f97316',
    };
  }

  // Tennis & Racket sports
  if (n.includes('tennis') || n.includes('badminton') || n.includes('squash')) {
    return {
      icon: Flame,
      bgColor: 'rgba(236, 72, 153, 0.12)',
      borderColor: 'rgba(236, 72, 153, 0.25)',
      color: '#ec4899',
    };
  }

  // Martial Arts & Athletics
  if (n.includes('karate') || n.includes('judo') || n.includes('boxing') || n.includes('dance') || n.includes('athletics')) {
    return {
      icon: Dumbbell,
      bgColor: 'rgba(234, 179, 8, 0.12)',
      borderColor: 'rgba(234, 179, 8, 0.25)',
      color: '#eab308',
    };
  }

  // Default / General Academy
  return {
    icon: GraduationCap,
    bgColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
    color: '#6366f1',
  };
}

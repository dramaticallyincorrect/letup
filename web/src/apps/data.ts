import type { AppSummary } from '@repo/data'

export type AppTint =
  | 'coral' | 'sage' | 'indigo' | 'amber' | 'plum' | 'graphite' | 'sky' | 'mint'

export type MarketplaceApp = {
  id: string
  name: string
  glyph: string
  tint: AppTint
  description: string
  category: string
  author: string
  installs: string
  rating: number
  featured?: boolean
  tag?: string
}

export type AppCard = {
  id: string
  name: string
  glyph: string
  tint: AppTint
  description: string
  category: string
  status: string
}

const TINT_LIST: AppTint[] = ['coral', 'sage', 'indigo', 'amber', 'plum', 'graphite', 'sky', 'mint']

const KEYWORD_GLYPHS: [string[], string][] = [
  [['timer', 'focus', 'pomodoro', 'work'], '◑'],
  [['todo', 'task', 'standup', 'coach', 'meeting'], '✓'],
  [['habit', 'streak', 'wellness'], '✿'],
  [['journal', 'mood', 'log', 'diary'], '☺'],
  [['note', 'notes', 'memo'], '✦'],
  [['recipe', 'food', 'cook'], '⌘'],
  [['flash', 'card', 'learn', 'study'], '✦'],
  [['email', 'write', 'polish', 'draft'], '❝'],
  [['budget', 'wallet', 'finance'], '◆'],
  [['plan', 'project', 'board'], '◈'],
  [['color', 'palette', 'design'], '◐'],
  [['regex', 'code', 'dev', 'developer'], '※'],
  [['poem', 'creative', 'story'], '❀'],
  [['sketch', 'draw', 'art'], '✷'],
  [['music', 'sound', 'audio'], '♫'],
  [['calc', 'math', 'convert'], '＋'],
]

export function getAppGlyph(name: string): string {
  const lower = name.toLowerCase()
  for (const [keywords, glyph] of KEYWORD_GLYPHS) {
    if (keywords.some(k => lower.includes(k))) return glyph
  }
  return '◉'
}

export function getAppTint(id: string): AppTint {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff
  }
  return TINT_LIST[Math.abs(hash) % TINT_LIST.length]
}

export function widgetToAppCard(w: AppSummary): AppCard {
  return {
    id: w.id,
    name: w.name,
    glyph: getAppGlyph(w.name),
    tint: getAppTint(w.id),
    description: w.description || 'A mini app built with Claude.',
    category: 'Productivity',
    status: w.status,
  }
}

export const CATEGORIES = [
  'All', 'Productivity', 'Writing', 'Learning',
  'Wellness', 'Creative', 'Developer', 'Design', 'Utilities',
]

export const MARKETPLACE_APPS: MarketplaceApp[] = [
  {
    id: 'mkt-meeting-notes',
    name: 'Meeting Notes',
    glyph: '✦',
    tint: 'indigo',
    description: 'Drop a transcript, get crisp notes, action items, and next steps in seconds.',
    category: 'Productivity',
    author: 'Liana Park',
    installs: '12.4k',
    rating: 4.8,
    featured: true,
    tag: "Editor's pick",
  },
  {
    id: 'mkt-habit',
    name: 'Tiny Habits',
    glyph: '✿',
    tint: 'sage',
    description: "A friendly streak tracker that nudges you only when you're slipping.",
    category: 'Wellness',
    author: 'Marco Velasquez',
    installs: '8.1k',
    rating: 4.6,
    tag: 'Trending',
  },
  {
    id: 'mkt-poem',
    name: 'Poem-a-Day',
    glyph: '❀',
    tint: 'plum',
    description: 'Generates a small poem from your morning notes. Surprisingly good.',
    category: 'Creative',
    author: 'Asha Iyer',
    installs: '3.2k',
    rating: 4.9,
    featured: true,
    tag: 'Staff favorite',
  },
  {
    id: 'mkt-regex',
    name: 'Regex Whisperer',
    glyph: '※',
    tint: 'graphite',
    description: 'Describe what you want to match. Get a tested regex back.',
    category: 'Developer',
    author: 'Quinn Tessaro',
    installs: '21.7k',
    rating: 4.7,
    tag: 'Developer pick',
  },
  {
    id: 'mkt-color',
    name: 'Palette Studio',
    glyph: '◐',
    tint: 'coral',
    description: 'Brand-safe palettes from any image or vibe.',
    category: 'Design',
    author: 'Hana Brewer',
    installs: '5.6k',
    rating: 4.5,
    tag: 'New',
  },
  {
    id: 'mkt-cite',
    name: 'Citation Tidy',
    glyph: '❝',
    tint: 'amber',
    description: 'Paste a URL, get a clean citation in MLA, APA, or Chicago.',
    category: 'Learning',
    author: 'Theo Nakamura',
    installs: '1.9k',
    rating: 4.4,
    tag: 'Underrated',
  },
  {
    id: 'mkt-budget',
    name: 'Pocket Budget',
    glyph: '◆',
    tint: 'sage',
    description: 'A weekly cash-flow check-in that fits in your morning coffee.',
    category: 'Productivity',
    author: 'Priya Whelan',
    installs: '4.0k',
    rating: 4.6,
  },
  {
    id: 'mkt-sketch',
    name: 'Daily Sketch Prompt',
    glyph: '✷',
    tint: 'plum',
    description: 'A new drawing prompt every morning, calibrated to your skill notes.',
    category: 'Creative',
    author: 'Rowan Salim',
    installs: '2.1k',
    rating: 4.7,
  },
]

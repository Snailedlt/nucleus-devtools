// Settings → Theme → Motion: how much moves. Animations, a level to pick quickly (All, Balanced, Some, None), and the
// switches it sets: the interface's own motion, Duo and Nucli (lively, loaders only, still, off), Nucli editing the
// code during fixes, and What's new playing animations by itself. Kept in this browser. When the device asks for less
// motion, nothing above "Still" applies, whatever is set.
/** loop: every scene moves. work: only the ones that show work under way (a loader, a progress) move, the rest hold
 *  their pose. still: every scene holds its pose. off: Duo and Nucli aren't shown. */
export type MascotMotion = 'loop' | 'work' | 'still' | 'off';
export interface Motion { ui: boolean; mascots: MascotMotion; editFx: boolean; newsAuto: boolean }
export type Preset = 'all' | 'balanced' | 'some' | 'none';

export const PRESETS: Record<Preset, Motion> = {
  all: { ui: true, mascots: 'loop', editFx: true, newsAuto: true },
  // The default: everything moves except what slows you down or covers the code (Nucli's edit animation is opt-in).
  balanced: { ui: true, mascots: 'loop', editFx: false, newsAuto: true },
  // The interface still eases into place and loaders still move (they say something is under way); Duo and Nucli
  // otherwise hold a pose, and What's new waits for Play.
  some: { ui: true, mascots: 'work', editFx: false, newsAuto: false },
  none: { ui: false, mascots: 'still', editFx: false, newsAuto: false },
};
export const DEFAULT_PRESET: Preset = 'balanced';
/** What each level does, in a sentence (Settings and the motion review show it under the choice). */
export const PRESET_TEXT: Record<Preset | 'custom', string> = {
  all: 'Everything moves, and Nucli edits the code himself when a fix goes in.',
  balanced: 'Everything moves, but fixes go in without Nucli editing the code (that covers it for a moment).',
  some: 'Loaders and progress still move, and the interface eases into place. Duo and Nucli otherwise hold a pose.',
  none: 'Nothing moves. Loaders show the pose for how far they are.',
  custom: 'Your own mix of the switches below.',
};
const KEY = 'nucleus-workbench-motion';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What's set (before the device's reduced-motion preference). */
export function savedMotion(): Motion {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // "Play once, then rest" is gone: those mascots are lively now.
    if (v && typeof v === 'object') return { ...PRESETS[DEFAULT_PRESET], ...v, ...(v.mascots === 'once' ? { mascots: 'loop' } : {}) };
    // The earlier "Mascots" setting (animated, still, off), carried over.
    const old = localStorage.getItem('nucleus-workbench-mascots');
    if (old === 'still') return { ...PRESETS[DEFAULT_PRESET], mascots: 'still' };
    if (old === 'off') return { ...PRESETS[DEFAULT_PRESET], mascots: 'off' };
  } catch { /* private mode */ }
  return { ...PRESETS[DEFAULT_PRESET] };
}
/** What applies: the setting, capped at "Still" when the device asks for less motion. */
export function motion(): Motion {
  const m = savedMotion();
  return reduce() ? { ui: false, mascots: m.mascots === 'off' ? 'off' : 'still', editFx: false, newsAuto: false } : m;
}
export function presetOf(m: Motion): Preset | 'custom' {
  return (Object.keys(PRESETS) as Preset[]).find((k) => JSON.stringify(PRESETS[k]) === JSON.stringify({ ui: m.ui, mascots: m.mascots, editFx: m.editFx, newsAuto: m.newsAuto })) ?? 'custom';
}
const listeners: (() => void)[] = [];
export const onMotion = (f: () => void) => listeners.push(f);
export function setMotion(m: Motion) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); localStorage.removeItem('nucleus-workbench-mascots'); } catch { /* private mode */ }
  applyMotion();
}
export function applyMotion() {
  const m = motion(), r = document.documentElement;
  if (m.ui) delete r.dataset.motionUi; else r.dataset.motionUi = 'off';
  r.dataset.mascots = m.mascots;
  listeners.forEach((f) => f());
}
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
applyMotion();

// The tip bar under the code. One general tip at a time (Next shows another), and Clippy-style
// tips that pop up once when the code or the cursor makes them relevant. Off with one click.
import { voteButtons } from './feedback';
import { CONTEXT_TIPS, GENERAL_TIPS, Tip, TipContext, TipShow, tipShown } from './tips';
import { scanHandler, inCallback, Scan } from './lines';
import { narrow } from './dom';
import { BETA } from './testplan';

const ON_KEY = 'nucleus-workbench-tips';
const SEEN_KEY = 'nucleus-workbench-tips-seen';
const SHOW_KEY = 'nucleus-workbench-tips-show';
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

interface Deps {
  editor: any;
  toast?: (s: string) => void;
  actions: Record<NonNullable<Tip['action']>['run'], () => void>;
  /** The control each action stands for: highlighted while its tip shows, so you learn where it lives. */
  targets?: Partial<Record<NonNullable<Tip['action']>['run'], () => HTMLElement | null>>;
  /** Who is using the workbench now: only tips for them (or for everyone) show. */
  audience?: () => 'newcomer' | 'developer';
}

export function initTips({ editor, actions, toast, targets, audience }: Deps) {
  // Settings › Testing's choice: beta only (after the full release tips follow the mode; the choice stays saved).
  const saved = BETA ? get(SHOW_KEY) : null;
  let show: TipShow = saved === 'all' || saved === 'newcomer' || saved === 'developer' || saved === 'everyone' ? saved : 'mode';
  const forNow = (t: Tip) => tipShown(t, show, audience?.() ?? 'newcomer');
  let on = get(ON_KEY) !== '0';
  const seen = new Set<string>(JSON.parse(get(SEEN_KEY) || '[]'));
  let general = Math.floor(Math.random() * GENERAL_TIPS.length);
  let lastContextAt = 0;
  let scan: Scan | undefined;
  const bar = $('#tipbar');
  const body = $('#tip-text');
  const act = $('#tip-action') as HTMLButtonElement;
  const label = $('#tip-label');
  let currentAction: (() => void) | undefined;

  let shown: Tip | undefined;
  function render(tip: Tip, contextual: boolean) {
    shown = tip;
    bar.classList.toggle('contextual', contextual);
    // Testers looking at other audiences' tips see whom each is for.
    const whom = show === 'mode' ? '' : ` · for ${tip.for === 'newcomer' ? 'newcomers' : tip.for === 'developer' ? 'developers' : 'everyone'}`;
    label.textContent = (contextual ? 'Heads up' : tip.topic ?? 'Tip') + whom;
    body.textContent = '';
    // `code` spans
    tip.text.split(/(`[^`]+`)/).forEach((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        const c = document.createElement('code');
        c.textContent = part.slice(1, -1);
        body.append(c);
      } else body.append(document.createTextNode(part));
    });
    $('#tip-votes').innerHTML = voteButtons('tip', tip.id, { up: 'Useful tip', down: 'Not useful' });
    document.querySelectorAll('.tip-target').forEach((e) => e.classList.remove('tip-target'));
    if (tip.action && on) {
      // Only a highlight: a control that isn't there (yet) must never stop the page.
      try {
        targets?.[tip.action.run]?.()?.classList.add('tip-target');
      } catch {
        /* no highlight */
      }
    }
    if (tip.action) {
      act.hidden = false;
      act.textContent = tip.action.label;
      currentAction = actions[tip.action.run];
    } else {
      act.hidden = true;
      currentAction = undefined;
    }
    bar.hidden = !on;
  }
  // Next and Back go round the tips for this mode only (Guided or Advanced), skipping the others.
  const showGeneral = (step = 1) => {
    const n = GENERAL_TIPS.length;
    for (let i = 0; i < n; i++) {
      general = (general + step + n) % n;
      if (forNow(GENERAL_TIPS[general])) break;
    }
    render(GENERAL_TIPS[general], false);
  };

  function check() {
    if (!on) return;
    const text: string = editor.getValue();
    const s = scanHandler(text);
    if (s) scan = s;
    const cur = editor.getCursor();
    const ctx: TipContext = { text, lineText: editor.getLine(cur.line) ?? '', inCallback: scan ? inCallback(scan, editor.indexFromPos(cur)) : false };
    // At most one heads-up every 20 s, each only once.
    if (Date.now() - lastContextAt < 20000) return;
    const tip = CONTEXT_TIPS.find((t) => !seen.has(t.id) && forNow(t) && t.when!(ctx));
    if (!tip) return;
    seen.add(tip.id);
    set(SEEN_KEY, JSON.stringify([...seen]));
    lastContextAt = Date.now();
    render(tip, true);
  }
  let timer: number | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = window.setTimeout(check, 900);
  };
  editor.on('cursorActivity', later);
  editor.on('change', later);

  $('#tip-next').addEventListener('click', () => showGeneral(1));
  $('#tip-prev').addEventListener('click', () => showGeneral(-1));
  $('#tip-off').addEventListener('click', () => setOn(false));
  $('#tip-off-2').addEventListener('click', () => setOn(false));
  // Phones: the tip is one line; tapping it shows all of it with back, next and Turn off.
  const phone = narrow;
  body.parentElement!.addEventListener('click', () => {
    if (phone()) bar.classList.toggle('open');
  });
  act.addEventListener('click', () => currentAction?.());
  const toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-tips-toggle]')];
  toggles.forEach((t) => t.addEventListener('click', () => setOn(!on)));

  function setOn(v: boolean) {
    if (!v && on) toast?.('Tips are off. Turn them back on in Settings.');
    on = v;
    set(ON_KEY, v ? '1' : '0');
    bar.hidden = !v;
    if (!v) document.querySelectorAll('.tip-target').forEach((e) => e.classList.remove('tip-target'));
    toggles.forEach((t) => {
      t.textContent = v ? 'Tips: on' : 'Tips: off';
      t.setAttribute('aria-pressed', String(v));
    });
    if (v) {
      showGeneral(1);
      later();
    }
  }
  setOn(on);
  return {
    toggle: () => setOn(!on),
    set: (v: boolean) => setOn(v),
    isOn: () => on,
    /** Which tips show (Settings › Testing). */
    show: () => show,
    setShow: (v: TipShow) => {
      show = v;
      set(SHOW_KEY, v);
      if (on) showGeneral(1);
    },
    /** The mode changed (Guided / Advanced): swap the shown tip if it isn't for this mode. */
    refresh: () => {
      if (on && shown && !forNow(shown)) showGeneral(1); // a heads-up or tip not for this mode any more
    },
    /** Show the heads-up tips again (they are shown once each). */
    reset: () => {
      seen.clear();
      set(SEEN_KEY, '[]');
      lastContextAt = 0;
      later();
    },
  };
}

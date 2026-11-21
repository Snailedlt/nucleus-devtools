// The guided tour of the workbench: a dimmed page with a cut-out around one part at a time, and a small card next to
// it (title, a sentence or two, "3 of 9", Back / Next / Skip tour). Plain TS and CSS, no library.
//
// It starts by itself once, after a person's first-visit questions (app.ts), and never for an automated browser or a
// link opened to something specific. Skip remembers the step: "Take the tour" (Menu, the ? dialog, the command
// palette, Settings, the footer) then offers to continue there or start over. Steps whose part isn't shown in this
// layout or screen size are left out.
//
// The card is a modal <dialog> in the top layer that covers the page, so the rest of the page is inert (the focus stays
// in the card) and Esc is the dialog's own cancel. ←/→ step, Enter goes on; the focus returns where it was at the end.
//
// Two kinds of step. A "look" step points at a part that is always on screen (the code, Check) and explains it. A
// do-it step (`act`) is for a part that opens something: click it in the cut-out (Lines opens Lines), or press its key.
// Doing it shows "✓ Done", moves the cut-out to what opened (`show`) and leaves it open, and Next gets the focus: the
// tour never goes on by itself, only on Next (or Enter). Leaving the step (Next, Back, Skip, Esc) puts back what it
// opened (`undo`: a panel closes again, a menu closes). Next, Back and Skip always work, so nothing blocks. Until the
// action is done the card is a non-modal dialog, so the cut-out (and only it: `.tour-block` covers the rest) can be
// clicked; Tab goes round the card's buttons and the part (Enter or Space on it does the action), Esc still skips, and
// the step's key works from the card too (`run` does it for the person). Once done, the card is modal again: what
// opened is there to look at, not to use (a menu's entries could save a file). A step whose part to click isn't shown
// in this layout (and has no key) is a plain "look" step there.
//
// Text is plain words with keys in backticks (`Ctrl+B`): they're drawn as keys (kbd.ts), never as code.

import { kbdify } from './kbd';
import { icon } from './icons';

const KEY = 'nucleus-workbench-tour';
const escHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Tour text as HTML: escaped, with `keys` drawn as keys. */
export const tourHtml = (t: string) => kbdify(escHtml(t).replace(/`([^`]+)`/g, '<kbd>$1</kbd>'));
const plain = (t: string) => t.replace(/`/g, '');

export interface TourStep {
  title: string;
  /** {key:<action id>} in it is that shortcut as it is bound when the step is shown (TourDeps.keyText). */
  text: string;
  /** Where it points: the first of these that is shown. None shown: the step is left out. */
  targets: string[];
  /** On a narrow screen, which half the page shows for this step (app.ts setView). */
  view?: 'code' | 'results';
  /** The results tab to open for it (Check, Try it, Docs). Not opened for a step with `act`: that's the action. */
  tab?: string;
  /** A tiny action: a click on (or in) `click`, or a key `key` matches. The tour waits for Next after it. */
  act?: {
    text: string;
    click?: string;
    key?: (e: KeyboardEvent) => boolean;
    run?: () => void;
    /** What the action opens: the cut-out moves to it and stays there until the step is left. */
    show?: string;
    /** Called when the step starts (e.g. to note whether a panel was open). */
    start?: () => void;
    /** Leaving a step whose action was done: put back what it opened. */
    undo?: () => void;
    /** The action ends the tour (as Finish) instead of going on: it opens something of its own. */
    end?: boolean;
  };
  /** An extra button on the card: ends the tour (as Finish), then runs. */
  button?: { label: string; run: () => void };
}
export interface TourDeps {
  steps: TourStep[];
  narrow: () => boolean;
  getView: () => 'code' | 'results';
  setView: (v: 'code' | 'results') => void;
  getTab: () => string;
  selectTab: (id: string) => void;
  /** The tour was finished (not skipped). */
  finished?: () => void;
  /** What {key:<action id>} in a step's text becomes: the shortcut's keys as they are bound now, in backticks, or
   *  words for an action that has no key. */
  keyText?: (id: string) => string;
}
interface Saved { state: 'done' | 'skipped'; step?: number }

const read = (): Saved | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && (v.state === 'done' || v.state === 'skipped') ? v : null;
  } catch {
    return null;
  }
};
const write = (v: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* not kept: it may show again */ } };
const automated = () => { try { return navigator.webdriver === true; } catch { return false; } };

export function initTour(d: TourDeps) {
  const dlg = document.createElement('dialog');
  dlg.id = 'tour';
  dlg.className = 'tour';
  dlg.setAttribute('aria-labelledby', 'tour-title');
  dlg.setAttribute('aria-describedby', 'tour-text tour-act');
  dlg.innerHTML = `<div class="tour-block" aria-hidden="true"></div><div class="tour-hole" aria-hidden="true"></div>
<div class="tour-card" role="document">
  <p class="tour-count"><span class="tour-ico" aria-hidden="true">${icon('compass')}</span> <span id="tour-count"></span></p>
  <h2 id="tour-title" tabindex="-1"></h2>
  <p id="tour-text"></p>
  <p class="tour-act" id="tour-act" hidden></p>
  <div class="tour-acts">
    <button type="button" class="btn tour-skip" data-tour="skip">Skip tour</button>
    <button type="button" class="btn" data-tour="extra" hidden></button>
    <span class="tour-sp"></span>
    <button type="button" class="btn" data-tour="back">Back</button>
    <button type="button" class="btn primary" data-tour="next">Next</button>
  </div>
  <p class="sr-only" aria-live="polite" id="tour-live"></p>
</div>`;
  document.body.append(dlg);
  const hole = dlg.querySelector<HTMLElement>('.tour-hole')!;
  const block = dlg.querySelector<HTMLElement>('.tour-block')!;
  const card = dlg.querySelector<HTMLElement>('.tour-card')!;
  const q = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  const btn = (k: string) => q<HTMLButtonElement>(`[data-tour=${k}]`);

  let list: TourStep[] = []; // the steps shown in this layout
  let at = 0;
  let mode: 'steps' | 'ask' = 'steps';
  let back: { focus: Element | null; view: 'code' | 'results'; tab: string } | null = null;
  /** The step whose action was done (its `undo` runs when it's left), and what it opened (the cut-out shows it). */
  let didAct: TourStep | null = null;
  let showing: HTMLElement | null = null;
  const firstShown = (sel: string) => [...document.querySelectorAll(sel)].find(shown) ?? null;
  /** The step's action here: none when its part to click isn't shown in this layout and it has no key. */
  const actOf = (s: TourStep | undefined) => (s?.act && (s.act.key || (s.act.click && firstShown(s.act.click))) ? s.act : undefined);
  /** The current step's action while it's still to do (none once done: the step waits for Next). */
  const act = () => (mode === 'steps' && dlg.open && didAct !== list[at] ? actOf(list[at]) : undefined);
  const actTarget = () => { const c = act()?.click; return c ? firstShown(c) : null; };
  /** Modal for a plain step; non-modal (the cut-out can be used) for a step with an action. */
  function setModal(modal: boolean) {
    if (dlg.open && dlg.classList.contains('free') === !modal) return;
    if (dlg.open) dlg.close();
    dlg.classList.toggle('free', !modal);
    if (modal) dlg.showModal(); else dlg.show();
  }

  const shown = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const targetOf = (s: TourStep) => s.targets.map((t) => document.querySelector(t)).find(shown) ?? null;
  const applyView = (s: TourStep) => { if (s.view && d.narrow() && d.getView() !== s.view) d.setView(s.view); };
  /** The steps whose part is shown here (each with its own half of a narrow page). */
  function available(): TourStep[] {
    const out = d.steps.filter((s) => { applyView(s); return !!targetOf(s); });
    if (back && d.narrow()) d.setView(back.view);
    return out;
  }

  function place() {
    block.style.clipPath = '';
    if (mode === 'ask') {
      hole.classList.add('none');
      card.classList.add('center');
      card.style.cssText = '';
      return;
    }
    card.classList.remove('center');
    const el = showing && shown(showing) ? showing : targetOf(list[at]);
    if (!el) { hole.classList.add('none'); card.style.cssText = ''; card.classList.add('center'); return; }
    hole.classList.remove('none');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const vw = innerWidth, vh = innerHeight, pad = 6, gap = 12, m = 12;
    const r = el.getBoundingClientRect();
    // The cut-out, kept on screen (a part taller than the window: the visible part of it).
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    const w = Math.min(vw - 4, r.right + pad) - x, h = Math.min(vh - 4, r.bottom + pad) - y;
    Object.assign(hole.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    // Clicks reach the page only through the cut-out (for a step with an action; a modal step makes the page inert).
    block.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x + w}px ${y}px, ${x + w}px ${y + h}px, ${x}px ${y + h}px, ${x}px ${y}px)`;
    // Phones: a bottom sheet (or at the top when the part is in the lower half).
    if (vw < 600) {
      const low = y + h / 2 > vh / 2;
      card.dataset.sheet = low ? 'top' : 'bottom';
      card.style.cssText = '';
      return;
    }
    delete card.dataset.sheet;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const clampX = (v: number) => Math.min(Math.max(m, v), vw - cw - m);
    const clampY = (v: number) => Math.min(Math.max(m, v), vh - ch - m);
    let left: number, top: number;
    if (y + h + gap + ch <= vh - m) { top = y + h + gap; left = clampX(x + w / 2 - cw / 2); }
    else if (y - gap - ch >= m) { top = y - gap - ch; left = clampX(x + w / 2 - cw / 2); }
    else if (x + w + gap + cw <= vw - m) { left = x + w + gap; top = clampY(y + h / 2 - ch / 2); }
    else if (x - gap - cw >= m) { left = x - gap - cw; top = clampY(y + h / 2 - ch / 2); }
    else { left = clampX(vw / 2 - cw / 2); top = clampY(vh - ch - m); } // a part as big as the page: over its bottom
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  /** Leaving a step: put back what its action opened. */
  function leave() {
    showing = null;
    const s = didAct;
    didAct = null;
    try { s?.act?.undo?.(); } catch { /* the tour goes on */ }
  }
  function render(focusNext = false) {
    leave();
    const s = list[at];
    applyView(s);
    const sa = actOf(s);
    if (s.tab && !sa && d.getTab() !== s.tab) d.selectTab(s.tab);
    setModal(!sa);
    sa?.start?.();
    q('#tour-count').textContent = `${at + 1} of ${list.length}`;
    q('#tour-title').textContent = s.title;
    // The keys are looked up now, not when the steps were built: a shortcut changed since the page loaded shows
    // as it is, and it's the one the step's action listens for.
    const text = s.text.replace(/\{key:(\w+)\}/g, (_, id: string) => d.keyText?.(id) ?? id);
    q('#tour-text').innerHTML = tourHtml(text);
    const a = q('#tour-act');
    a.hidden = !sa;
    a.classList.remove('done');
    a.innerHTML = sa ? `👉 ${tourHtml(sa.text)}` : '';
    btn('extra').hidden = !s.button;
    btn('extra').textContent = s.button?.label ?? '';
    btn('back').hidden = at === 0;
    btn('back').textContent = 'Back';
    // The last step has Finish: Skip there would only be a second way out (Esc still skips).
    btn('skip').hidden = at === list.length - 1;
    btn('skip').textContent = 'Skip tour';
    btn('next').textContent = at === list.length - 1 ? 'Finish' : 'Next';
    q('#tour-live').textContent = `Step ${at + 1} of ${list.length}: ${s.title}. ${plain(text)}${sa ? ` ${plain(sa.text)}` : ''}`;
    if (focusNext || (document.activeElement as HTMLElement | null)?.hidden || !dlg.contains(document.activeElement)) btn('next').focus();
    requestAnimationFrame(place);
  }

  function open() {
    if (!dlg.open) {
      back = { focus: document.activeElement, view: d.getView(), tab: d.getTab() };
      setModal(true);
      addEventListener('resize', onResize);
      document.addEventListener('click', onPageClick, true);
      document.addEventListener('keydown', onPageKey, true);
    }
  }
  /** The step's action was done: "✓ Done", the cut-out on what opened, Next focused. It stays until the step is left. */
  function done() {
    const s = list[at], sa = act();
    if (!sa) return;
    if (sa.end) { end('done'); return; } // what it opens takes over (the page's own handler runs after this)
    didAct = s;
    const a = q('#tour-act');
    a.classList.add('done');
    a.innerHTML = tourHtml('✓ Done. Press Next when you\'re ready.');
    q('#tour-live').textContent = 'Done. Press Next when you\'re ready.';
    // What opened is there once the page has handled the click or key (this runs first). Then the card is modal again
    // (what opened is to look at) and Next has the focus.
    setTimeout(() => {
      if (!dlg.open || mode !== 'steps' || didAct !== s || list[at] !== s) return;
      showing = sa.show ? firstShown(sa.show) : null;
      setModal(true);
      btn('next').focus();
      requestAnimationFrame(place);
    }, 60);
  }
  const onPageClick = (e: MouseEvent) => {
    const c = act()?.click;
    if (c && (e.target as Element | null)?.closest?.(c)) done();
  };
  const onPageKey = (e: KeyboardEvent) => {
    const s = act();
    if (!s) return;
    const inCard = dlg.contains(e.target as Node);
    if (s.key?.(e)) {
      // From the card: do it for them (the code gets the focus); in the page, the page does it.
      if (inCard) { e.preventDefault(); e.stopPropagation(); s.run?.(); }
      done();
      return;
    }
    // The part being pointed at, from the keyboard: Tab back to the card, Esc skips.
    const t = actTarget();
    if (!t || inCard || e.target !== t) return;
    if (e.key === 'Escape') { e.preventDefault(); skip(); }
    else if (e.key === 'Tab') {
      const bs = cardButtons();
      e.preventDefault();
      (e.shiftKey ? bs[bs.length - 1] : bs[0])?.focus();
    }
  };
  const cardButtons = () => [...card.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.hidden);
  function go(step: number) {
    if (!back) back = { focus: document.activeElement, view: d.getView(), tab: d.getTab() };
    list = available();
    if (!list.length) return;
    mode = 'steps';
    at = Math.min(Math.max(0, step), list.length - 1);
    open();
    render(true);
  }
  function end(state: 'done' | 'skipped') {
    write(state === 'done' ? { state } : { state, step: at });
    close();
    if (state === 'done') d.finished?.();
  }
  function close() {
    leave();
    if (dlg.open) dlg.close();
    dlg.classList.remove('free');
    removeEventListener('resize', onResize);
    document.removeEventListener('click', onPageClick, true);
    document.removeEventListener('keydown', onPageKey, true);
    const b = back;
    back = null;
    if (!b) return;
    if (d.getTab() !== b.tab) d.selectTab(b.tab);
    if (d.narrow() && d.getView() !== b.view) d.setView(b.view);
    if (b.focus instanceof HTMLElement && b.focus.isConnected) b.focus.focus();
  }
  let raf = 0;
  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  /** "Take the tour": after a skip, continue where it stopped or start over; else from the start. */
  function take() {
    const s = read();
    const step = s?.state === 'skipped' ? s.step ?? 0 : 0;
    if (step <= 0) return go(0);
    back = { focus: document.activeElement, view: d.getView(), tab: d.getTab() };
    list = available();
    if (!list.length) return;
    const n = Math.min(step, list.length - 1);
    mode = 'ask';
    at = n;
    q('#tour-count').textContent = '';
    q('#tour-act').hidden = true;
    btn('extra').hidden = true;
    q('#tour-title').textContent = 'Take the tour';
    q('#tour-text').textContent = `You stopped at step ${n + 1} of ${list.length} (${list[n].title}).`;
    btn('skip').hidden = false;
    btn('skip').textContent = 'Not now';
    btn('back').hidden = false;
    btn('back').textContent = 'Start over';
    btn('next').textContent = 'Continue where you left off';
    q('#tour-live').textContent = '';
    open();
    setModal(true);
    btn('next').focus();
    requestAnimationFrame(place);
  }

  const next = () => (mode === 'ask' ? go(at) : at < list.length - 1 ? (at++, render()) : end('done'));
  const prev = () => (mode === 'ask' ? go(0) : at > 0 && (at--, render()));
  const skip = () => {
    if (mode === 'ask') return close();
    end('skipped');
  };
  dlg.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-tour]')?.dataset.tour;
    if (k === 'next') next();
    else if (k === 'extra') { const b = list[at]?.button; end('done'); b?.run(); }
    else if (k === 'back') prev();
    else if (k === 'skip') skip();
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); skip(); });
  dlg.addEventListener('keydown', (e) => {
    const free = dlg.classList.contains('free');
    // A step with an action is a non-modal dialog: the card's keys stay in it (no workbench shortcuts), Esc skips, and
    // Tab goes round the card's buttons and the part in the cut-out.
    if (free) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); return skip(); }
      if (e.key === 'Tab') {
        const bs = cardButtons(), t = actTarget();
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        if (!e.shiftKey && i === bs.length - 1) { e.preventDefault(); (t ?? bs[0])?.focus(); }
        else if (e.shiftKey && i <= 0) { e.preventDefault(); (t ?? bs[bs.length - 1])?.focus(); }
        return;
      }
    }
    if (e.altKey || e.ctrlKey || e.metaKey || mode === 'ask') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    // Enter on the card itself (not on a button, which does its own thing): on.
    else if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); next(); }
  });
  // A click on the dimmed page does nothing (no accidental skip); the card's buttons and Esc are the ways out.

  return {
    take,
    /** The first visit's own start: once, never after Skip or Finish, never for an automated browser. */
    auto() {
      if (read() || automated() || dlg.open || document.querySelector('dialog[open]')) return;
      go(0);
    },
    isOpen: () => dlg.open,
  };
}

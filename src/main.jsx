import React from 'react';
import {createRoot} from 'react-dom/client';
import {
  Button, Menu, MenuItem, MenuTrigger, Popover,
  Sheet, SheetBackdrop, SheetContent, SheetOverlay
} from 'react-aria-components';

const h = React.createElement;
const $ = (s) => document.querySelector(s);
const logEl = $('#log');
const log = (msg) => {
  logEl.textContent = `${(performance.now() / 1000).toFixed(2)}s ${msg}\n` + logEl.textContent.split('\n').slice(0, 12).join('\n');
};

// ---------------------------------------------------------------------------
// The repro itself.
// ---------------------------------------------------------------------------
// A fresh App per open, so each sheet mounts already open, as on a page load.
function App() {
  let [isOpen, setOpen] = React.useState(true);
  return h(SheetOverlay, {position: 'right', isOpen, onOpenChange: setOpen},
    h(SheetBackdrop, {className: 'scrim'}),
    h(Sheet, null,
      h(SheetContent, {'aria-label': 'Sheet'},
        h('p', null, 'Sheet content'),
        h(MenuTrigger, null,
          h(Button, {id: 'menu-button'}, 'Open menu'),
          h(Popover, null,
            h(Menu, {'aria-label': 'Actions'},
              h(MenuItem, null, 'First item'),
              h(MenuItem, null, 'Second item'),
              h(MenuItem, null, 'Third item')))),
        h('p', null, h(Button, {slot: 'close', id: 'close-button'}, 'Close')))));
}

const root = createRoot($('#root'));
let openKey = 0;
function reopen() {
  openKey += 1;
  root.render(h(App, {key: openKey}));
  log(`sheet #${openKey} mounted`);
}

// ---------------------------------------------------------------------------
// The deterministic trigger: in the first frame of the arrival, focus the menu
// button, then press Enter on it as a keyboard does. Tab is what a person
// presses first; React Aria reads it to set keyboard modality, so it is sent
// too. The focus() is what interrupts the scroll, since it scrolls the button
// into view; the Enter only opens the menu.
// ---------------------------------------------------------------------------
function key(target, type, k) {
  target.dispatchEvent(new KeyboardEvent(type, {key: k, code: k, bubbles: true, cancelable: true, composed: true}));
}
function reproduce() {
  reopen();
  let start = performance.now();
  let tick = () => {
    let button = document.getElementById('menu-button');
    let scroller = document.querySelector('[data-sheet-scroll]');
    // Act in the first frame the arrival scroll has moved.
    if (!button || !scroller || scroller.scrollLeft < 1) {
      if (performance.now() - start < 2000) return requestAnimationFrame(tick);
      return log('Reproduce: the arrival never started');
    }
    log(`Reproduce: at scrollLeft ${Math.round(scroller.scrollLeft)} of ${innerWidth}: Tab, focus(), Enter`);
    key(document.activeElement || document.body, 'keydown', 'Tab');
    button.focus();
    key(document.activeElement || document.body, 'keyup', 'Tab');
    key(button, 'keydown', 'Enter');
    key(button, 'keyup', 'Enter');
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// The workaround from the issue: watch each [data-sheet-scroll] as it mounts.
// If it is not at rest after its scroll has stalled for 400 ms, or after 1.5 s,
// scroll it to the rest position instantly, which fires the scrollend the
// enter waits on. For a right-hand sheet the rest position is one viewport in.
// It keeps watching after data-entering clears, since an interruption can also
// end the enter with the scroller back at 0, and stops once the scroller has
// reached its rest position, so it never fights a later swipe.
// ---------------------------------------------------------------------------
const watched = new WeakSet();
function watchScroller(scroller) {
  if (watched.has(scroller)) return;
  watched.add(scroller);
  let rest = () => innerWidth;
  let atRest = () => Math.abs(scroller.scrollLeft - rest()) < 1;
  let lastScroll = performance.now();
  let onScroll = () => { lastScroll = performance.now(); };
  scroller.addEventListener('scroll', onScroll);
  let born = performance.now();
  let timer = setInterval(() => {
    if (!scroller.isConnected) return clearInterval(timer);
    let overlay = scroller.closest('.react-aria-SheetOverlay');
    if (!overlay || overlay.hasAttribute('data-exiting') || atRest()) return clearInterval(timer);
    let now = performance.now();
    if (!$('#workaround').checked) return;
    if (!atRest() && (now - lastScroll > 400 || now - born > 1500)) {
      log(`workaround: scroller stalled at ${Math.round(scroller.scrollLeft)}, jumping to ${rest()}`);
      scroller.scrollTo({left: rest(), behavior: 'instant'});
      clearInterval(timer);
    }
  }, 100);
}
new MutationObserver(() => {
  document.querySelectorAll('[data-sheet-scroll]').forEach(watchScroller);
}).observe(document.body, {childList: true, subtree: true});

// ---------------------------------------------------------------------------
// The live status line.
// ---------------------------------------------------------------------------
let mountedAt = performance.now();
let lastKey = 0;
function describe(el) {
  if (!el || el === document.body) return 'body';
  let label = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24);
  return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${label}"`;
}
function status() {
  if (openKey !== lastKey) { lastKey = openKey; mountedAt = performance.now(); }
  let overlay = document.querySelector('.react-aria-SheetOverlay');
  let panel = document.querySelector('.react-aria-Sheet');
  let scroller = document.querySelector('[data-sheet-scroll]');
  let el = $('#status');
  if (!overlay || !panel) {
    el.className = '';
    el.textContent = 'No sheet open. Press Reopen or Reproduce.';
    window.__sheetState = {openKey, open: false};
    return requestAnimationFrame(status);
  }
  let entering = overlay.hasAttribute('data-entering');
  let r = panel.getBoundingClientRect();
  let visible = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
  let where = r.right <= innerWidth + 0.5 && r.left >= -0.5
    ? 'fully inside the window'
    : `${Math.round(r.right - innerWidth)}px past the right edge (${Math.round(100 * visible / r.width)}% visible)`;
  let menu = document.querySelector('.react-aria-Menu');
  let age = (performance.now() - mountedAt) / 1000;
  let inside = r.right <= innerWidth + 0.5 && r.left >= -0.5;
  let stuck = entering && age > 2;
  let offscreen = !inside && age > 2;
  el.className = stuck || offscreen ? 'bad' : entering ? '' : 'good';
  el.textContent =
    `sheet #${openKey}, opened ${age.toFixed(1)}s ago\n` +
    `entering: ${entering ? 'YES (data-entering is still set)' : 'no, it finished entering'}${stuck ? '   <- BUG: stuck entering' : ''}\n` +
    `panel: left ${Math.round(r.left)}, right ${Math.round(r.right)}, window width ${innerWidth}: ${where}${offscreen ? '   <- BUG: open but off-screen' : ''}\n` +
    `scroller: scrollLeft ${scroller ? Math.round(scroller.scrollLeft) : '?'} (rest position ${innerWidth})\n` +
    `menu: ${menu ? 'open' : 'closed'}\n` +
    `focus: ${describe(document.activeElement)}\n` +
    `workaround: ${$('#workaround').checked ? 'on' : 'off'}`;
  // Exposed for automated checks.
  window.__sheetState = {openKey, open: true, entering, panelLeft: r.left, panelRight: r.right, innerWidth,
    scrollLeft: scroller?.scrollLeft, inside, menuOpen: !!menu, focus: describe(document.activeElement), age};
  requestAnimationFrame(status);
}

$('#reopen').addEventListener('click', reopen);
$('#reproduce').addEventListener('click', reproduce);
window.__reopen = reopen;
window.__reproduce = reproduce;
reopen();
requestAnimationFrame(status);

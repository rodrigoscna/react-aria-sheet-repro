# react-aria-sheet-repro

A side `Sheet` from `react-aria-components` enters by smooth-scrolling its
`[data-sheet-scroll]` container, and its enter resolves only on that
container's next `scrollend`. When a focus inside the sheet scrolls that
container early in the arrival, the scroll stops short and the sheet is left
open with its panel off the window's right edge and its scrim over the page,
either still `data-entering` or finished entering at the exit position.

Issue: [adobe/react-spectrum#11015](https://github.com/adobe/react-spectrum/issues/11015)

**Open it in StackBlitz:**
<https://stackblitz.com/github/rodrigoscna/react-aria-sheet-repro>

## Versions

- `react-aria-components` 1.22.1
- `react` and `react-dom` 19.3.0
- `vite` 8.3.7
- Chromium

Locally: `npm ci && npm run dev`.

## The setup

`<SheetOverlay position="right" isOpen>` mounted fresh, as on a page load, with
a `MenuTrigger` button inside it. Everything is in
[`src/main.jsx`](src/main.jsx): the `App`, the `reproduce()` trigger, the
workaround and the live status line.

The sheet opens with the page. While it is open the page behind it is inert, so
close it first (Esc, or its **Close** button) before using the controls.

## Reproduce it with the button

Press **Reproduce**. It reopens the sheet and, in the first frame of the
arrival, focuses the menu button and presses Enter on it the way a keyboard
does. The status line turns red and reads `BUG: stuck entering` or
`BUG: open but off-screen` two seconds after the sheet opened.

## Reproduce it by hand

Press **Reopen**, then press Tab and Enter while the sheet slides in. The
window is the first ~150 ms of a ~640 ms arrival: a Tab landing later than
about 200 ms after Reopen lets the sheet arrive normally. It is easiest from the
keyboard: Tab to **Reopen**, then press Enter and Tab in one quick roll. CPU
throttling in DevTools does not widen the window in Chromium, since the smooth
scroll runs on a clock rather than on the main thread.

## What triggers it

The `focus()`, because it scrolls the scroller to bring the button into view;
the Enter only opens the menu. A `focus({preventScroll: true})` followed by the
same Enter leaves the arrival alone.

- Focus in the very first frame leaves the sheet `data-entering` for good, since
  no `scrollend` follows.
- Focus a little later, before about 200 ms, ends with the scroller back at 0,
  its exited position, and a `scrollend` that resolves the enter there, so
  `data-entering` clears while the panel stays entirely off-screen.

The sheet's IntersectionObserver never saw the panel, so it does not close
either.

## The workaround

Tick **Apply workaround** and press **Reproduce** again: the sheet arrives. It
watches each `[data-sheet-scroll]` as it mounts, and if the scroller is not at
rest after its scroll has stalled for 400 ms, or after 1.5 s, scrolls it to the
rest position instantly, which fires the `scrollend` the enter waits on. For a
right-hand sheet the rest position is one viewport in. It stops once the
scroller has reached its rest position, so it never fights a later swipe.

## License

[MIT](LICENSE)

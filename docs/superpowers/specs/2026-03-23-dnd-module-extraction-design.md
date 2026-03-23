# Design: Extract Drag-and-Drop into Separate Module

**Date:** 2026-03-23
**Status:** Approved

## Problem

The `favorited-languages.ts` file contains ~50 lines of raw HTML5 Drag and Drop event handling mixed with UI template code. This makes the file harder to read and the DnD logic non-reusable.

## Decision

Use **Pragmatic Drag and Drop** by Atlassian as the DnD library. It is:
- Tiny (~4.7 KB gzipped core)
- Framework-agnostic and data-first (never mutates DOM — perfect for lit-html)
- Actively maintained, battle-tested in Trello/Jira/Confluence
- Headless — we control all visual feedback via CSS classes

The trade-off: no built-in reorder animations. We implement a lightweight FLIP animation ourselves.

## Architecture

### New module: `src/entrypoints/popup/scripts/lib/sortable.ts`

Thin wrapper around Pragmatic DnD. Responsibilities:

1. Accept a container element and config (see Interface below)
2. For each child of the container, attach `draggable()` and `dropTargetForElements()` from Pragmatic DnD
3. Use `monitorForElements()` to manage visual state classes: `.dragging` on the dragged item, `.drag-over` on valid drop targets
4. On drop, determine source/target indices from DOM position (`Array.from(container.children).indexOf(element)`) and call `onReorder`
5. Before calling `onReorder`, snapshot child positions (FLIP: First). After DOM updates, use `requestAnimationFrame` to capture new positions (Last), compute deltas (Invert), and animate (Play) using CSS transforms
6. Return a `cleanup()` function that detaches all listeners
7. Expose a `reconnect()` function to re-attach after lit-html re-renders the list (new DOM nodes)

### Interface

```typescript
interface SortableConfig {
  onReorder: (fromIndex: number, toIndex: number) => void;
  getHandle?: (element: HTMLElement) => HTMLElement | null;
}

interface SortableInstance {
  cleanup: () => void;
  reconnect: () => void;
}

function initSortable(container: HTMLElement, config: SortableConfig): SortableInstance;
```

Notes:
- `getHandle` returns the drag handle element for a given child (e.g., `el => el.querySelector('.tag-drag-handle')`). Pragmatic DnD's `draggable()` takes an `HTMLElement` for `dragHandle`, not a selector — this function does the translation.
- Index calculation uses DOM position at drop time (`Array.from(container.children).indexOf(el)`), avoiding stale index data.

### FLIP animation coordination with lit-html

The `onReorder` callback triggers `Settings.langCodes.set()`, which synchronously fires `browserStorageLocalSV`'s in-memory cache update, which triggers the `Settings.langCodes.subscribe(renderApp)` callback. The `renderApp()` → `render()` call from lit-html is synchronous. Therefore:

1. **First:** snapshot all child `getBoundingClientRect()` before calling `onReorder`
2. **Synchronous reorder:** `onReorder` is called → `Settings.langCodes.set()` → subscription fires → `renderApp()` → `render()` patches DOM synchronously
3. **Last/Invert/Play:** in a `requestAnimationFrame` after `onReorder` returns, read new positions, compute deltas, apply CSS `transform` to animate from old to new

**Critical:** The template must use lit-html's `repeat()` directive with the language code as the key (not plain `map()`). With `map()`, lit-html does positional DOM patching — nodes stay in place and have their text mutated, so there are no position changes to animate. With `repeat(langCodes, code => code, ...)`, lit-html tracks nodes by key and physically relocates them, enabling FLIP.

After FLIP completes, `reconnect()` is called to re-bind Pragmatic DnD to the (potentially moved) DOM nodes.

### Changes to `favorited-languages.ts`

- Remove all 6 drag handler functions and `draggedIndex` state (~50 lines)
- Remove all `@drag*` event bindings from the `<span>` template
- Remove `draggable="true"` from template — let Pragmatic DnD manage this attribute
- Switch from `langCodes.map(...)` to `repeat(langCodes, code => code, (code, i) => ...)` for keyed DOM reuse
- Keep the drag handle SVG for visual affordance
- After lit-html renders, call `initSortable()` on `.selected-languages` with `getHandle: el => el.querySelector('.tag-drag-handle')` and an `onReorder` callback that splices `Settings.langCodes`
- On list size changes (add/remove), call `reconnect()` to re-bind new DOM nodes. This is triggered inside the returned template function: track previous list length, and if it changed, schedule `reconnect()` via `requestAnimationFrame`

### CSS changes in `style.css`

- Keep existing `.dragging`, `.drag-over`, `.tag-drag-handle` styles
- Replace `transition: all var(--transition-fast)` on `.language-tag` with explicit properties: `transition: background var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast)` — this avoids conflicting with FLIP's `transform` animation which is applied directly via JS
- No other changes needed

### Dependencies

- `@atlaskit/pragmatic-drag-and-drop` — core: `draggable`, `dropTargetForElements`, `monitorForElements`
- `@atlaskit/pragmatic-drag-and-drop-hitbox` — for `closestEdge` edge detection and reorder utilities

### Edge cases

- **Empty list:** The `.selected-languages` container doesn't exist when the list is empty (template renders `.favorites-empty` instead). `initSortable` is only called when the container exists. If all items are removed, call `cleanup()`.
- **Single item:** Dragging is allowed but `onReorder` is not called when `fromIndex === toIndex` (no-op).
- **Same-position drop:** `sortable.ts` checks `fromIndex !== toIndex` before calling `onReorder`.
- **Rapid adds/removes during animation:** Cancel any in-flight FLIP animation (remove `transform` style) before starting a new one. `reconnect()` cancels pending animations.

## Data flow

```
User drags tag
  -> Pragmatic DnD fires monitor events
  -> sortable.ts applies .dragging/.drag-over classes
  -> User drops
  -> sortable.ts computes fromIndex/toIndex from DOM position
  -> sortable.ts snapshots child positions (FLIP: First)
  -> Calls onReorder(fromIndex, toIndex)
  -> favorited-languages.ts splices Settings.langCodes
  -> Settings.langCodes.set() -> subscription -> renderApp() -> render() [synchronous]
  -> lit-html repeat() relocates keyed DOM nodes
  -> requestAnimationFrame: sortable.ts reads new positions (Last), applies transform (Invert), animates (Play)
  -> Animation ends -> reconnect() re-binds Pragmatic DnD to current DOM nodes
```

## Files changed

| File | Change |
|------|--------|
| `package.json` | Add `@atlaskit/pragmatic-drag-and-drop` and `@atlaskit/pragmatic-drag-and-drop-hitbox` |
| `src/entrypoints/popup/scripts/lib/sortable.ts` | New — DnD wrapper module |
| `src/entrypoints/popup/scripts/favorited-languages.ts` | Remove DnD handlers, switch to `repeat()`, integrate `initSortable()` |
| `src/entrypoints/popup/style.css` | Make `.language-tag` transition properties explicit |

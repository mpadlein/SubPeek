# Design: Extract Drag-and-Drop into Separate Module

**Date:** 2026-03-23
**Status:** Approved

## Problem

The `favorited-languages.ts` file contains ~50 lines of raw HTML5 Drag and Drop event handling mixed with UI template code. This makes the file harder to read and the DnD logic non-reusable.

## Decision

Use **Pragmatic Drag and Drop** by Atlassian (`@atlaskit/pragmatic-drag-and-drop`) as the DnD library. It is:
- Tiny (~4.7 KB gzipped core)
- Framework-agnostic and data-first (never mutates DOM — perfect for lit-html)
- Actively maintained, battle-tested in Trello/Jira/Confluence
- Headless — we control all visual feedback via CSS classes

The trade-off: no built-in reorder animations. We implement a lightweight FLIP animation ourselves (~15-20 lines).

## Architecture

### New module: `src/entrypoints/popup/scripts/lib/sortable.ts`

Thin wrapper around Pragmatic DnD. Responsibilities:

1. Accept a container element and config: `{ onReorder: (fromIndex: number, toIndex: number) => void, handleSelector?: string }`
2. For each child of the container, attach `draggable()` and `dropTarget()` from Pragmatic DnD
3. Manage visual state classes on elements: `.dragging` on the dragged item, `.drag-over` on valid drop targets
4. On drop, determine source/target indices and call `onReorder`
5. Perform FLIP animation: snapshot child positions before reorder, after the DOM updates apply CSS `transform` to animate from old to new positions
6. Return a `cleanup()` function that detaches all listeners
7. Expose a `reconnect()` function to re-attach after lit-html re-renders the list (new DOM nodes)

### Interface

```typescript
interface SortableConfig {
  onReorder: (fromIndex: number, toIndex: number) => void;
  handleSelector?: string; // e.g. ".tag-drag-handle"
}

interface SortableInstance {
  cleanup: () => void;
  reconnect: () => void; // call after lit-html re-renders
}

function initSortable(container: HTMLElement, config: SortableConfig): SortableInstance;
```

### Changes to `favorited-languages.ts`

- Remove all 6 drag handler functions (`handleDragStart`, `handleDragEnd`, `handleDragOver`, `handleDragEnter`, `handleDragLeave`, `handleDrop`) and `draggedIndex` state
- Remove all `@drag*` event bindings from the `<span>` template
- Keep `draggable="true"` attribute and the drag handle SVG for visual affordance
- After lit-html renders, call `initSortable()` on the `.selected-languages` container with `handleSelector: ".tag-drag-handle"` and an `onReorder` callback that splices `Settings.langCodes`
- On re-render (language added/removed), call `reconnect()` to re-attach to new DOM nodes

### CSS changes in `style.css`

- Keep existing `.dragging`, `.drag-over`, `.tag-drag-handle` styles (they work as-is)
- Add `transition: transform 200ms ease` to `.language-tag` for FLIP animation
- Minor adjustments if needed for Pragmatic DnD's drag preview behavior

### Dependencies

- Add: `@atlaskit/pragmatic-drag-and-drop` (core + hitbox/reorder presets)
- No other new dependencies

## Data flow

```
User drags tag
  -> Pragmatic DnD fires monitor events
  -> sortable.ts applies .dragging/.drag-over classes
  -> User drops
  -> sortable.ts calculates fromIndex/toIndex
  -> sortable.ts snapshots child positions (FLIP: First)
  -> Calls onReorder(fromIndex, toIndex)
  -> favorited-languages.ts splices Settings.langCodes
  -> Settings change triggers lit-html re-render (new DOM)
  -> sortable.ts applies FLIP transform animation (Last, Invert, Play)
  -> Calls reconnect() to re-bind new DOM nodes
```

## Files changed

| File | Change |
|------|--------|
| `package.json` | Add `@atlaskit/pragmatic-drag-and-drop` dependency |
| `src/entrypoints/popup/scripts/lib/sortable.ts` | New — DnD wrapper module |
| `src/entrypoints/popup/scripts/favorited-languages.ts` | Remove DnD handlers, integrate `initSortable()` |
| `src/entrypoints/popup/style.css` | Add transition for FLIP animation |

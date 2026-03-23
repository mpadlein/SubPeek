# DnD Module Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract drag-and-drop reorder logic from `favorited-languages.ts` into a reusable `sortable.ts` module powered by Pragmatic Drag and Drop, with FLIP animations for smooth reordering.

**Architecture:** New `sortable.ts` wraps Pragmatic DnD's headless primitives (`draggable`, `dropTargetForElements`, `monitorForElements`) into a single `initSortable()` function that manages bindings, visual classes, and FLIP animation. `favorited-languages.ts` becomes a pure template — it switches from `map()` to lit-html's `repeat()` directive for keyed DOM reuse, and delegates all drag logic to `initSortable()`.

**Tech Stack:** TypeScript, lit-html (`repeat` directive), `@atlaskit/pragmatic-drag-and-drop`, CSS transitions (FLIP)

**Spec:** `docs/superpowers/specs/2026-03-23-dnd-module-extraction-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `@atlaskit/pragmatic-drag-and-drop` dependency |
| `src/entrypoints/popup/scripts/lib/sortable.ts` | Create | DnD wrapper: bindings, visual classes, FLIP animation |
| `src/entrypoints/popup/scripts/favorited-languages.ts` | Modify | Pure template with `repeat()`, delegates DnD to sortable |
| `src/entrypoints/popup/style.css` | Modify | Explicit transition properties on `.language-tag` |

---

### Task 1: Install Pragmatic Drag and Drop

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

```bash
npm install @atlaskit/pragmatic-drag-and-drop
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @atlaskit/pragmatic-drag-and-drop"
```

---

### Task 2: Create `sortable.ts` module

**Files:**
- Create: `src/entrypoints/popup/scripts/lib/sortable.ts`

- [ ] **Step 1: Write `sortable.ts`**

```typescript
import {
    draggable,
    dropTargetForElements,
    monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

export interface SortableConfig {
    onReorder: (fromIndex: number, toIndex: number) => void;
    getHandle?: (element: HTMLElement) => HTMLElement | null;
}

export interface SortableInstance {
    cleanup: () => void;
    reconnect: () => void;
}

const FLIP_DURATION_MS = 200;

export function initSortable(
    container: HTMLElement,
    config: SortableConfig,
): SortableInstance {
    let cleanupFns: (() => void)[] = [];

    function getIndex(el: Element): number {
        return Array.from(container.children).indexOf(el);
    }

    function snapshotRects(): Map<Element, DOMRect> {
        const rects = new Map<Element, DOMRect>();
        for (const child of Array.from(container.children)) {
            rects.set(child, child.getBoundingClientRect());
        }
        return rects;
    }

    function animateFlip(oldRects: Map<Element, DOMRect>) {
        const children = Array.from(container.children) as HTMLElement[];

        // Cancel any in-flight animations
        for (const el of children) {
            el.style.transform = "";
            el.style.transition = "";
        }

        // Invert: compute deltas and set transforms to old positions
        const animated: HTMLElement[] = [];
        for (const el of children) {
            const oldRect = oldRects.get(el);
            if (!oldRect) continue;
            const newRect = el.getBoundingClientRect();
            const dx = oldRect.left - newRect.left;
            const dy = oldRect.top - newRect.top;
            if (dx === 0 && dy === 0) continue;
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            animated.push(el);
        }

        if (animated.length === 0) return;

        // Force reflow so transforms are applied before transition
        void container.offsetWidth;

        // Play: add transition and clear transforms to animate to new positions
        for (const el of animated) {
            el.style.transition = `transform ${FLIP_DURATION_MS}ms ease`;
            el.style.transform = "";
            el.addEventListener(
                "transitionend",
                () => {
                    el.style.transition = "";
                },
                { once: true },
            );
        }
    }

    function bind() {
        for (const fn of cleanupFns) fn();
        cleanupFns = [];

        const children = Array.from(container.children) as HTMLElement[];

        for (const child of children) {
            const handle = config.getHandle?.(child) ?? child;

            cleanupFns.push(
                draggable({
                    element: child,
                    dragHandle: handle,
                    onDragStart: () => child.classList.add("dragging"),
                    onDrop: () => child.classList.remove("dragging"),
                }),
            );

            cleanupFns.push(
                dropTargetForElements({
                    element: child,
                    onDragEnter: () => child.classList.add("drag-over"),
                    onDragLeave: () => child.classList.remove("drag-over"),
                    onDrop: () => child.classList.remove("drag-over"),
                }),
            );
        }

        cleanupFns.push(
            monitorForElements({
                onDrop: ({ source, location }) => {
                    const target = location.current.dropTargets[0];
                    if (!target) return;

                    const fromIndex = getIndex(source.element);
                    const toIndex = getIndex(target.element);
                    if (
                        fromIndex === -1 ||
                        toIndex === -1 ||
                        fromIndex === toIndex
                    )
                        return;

                    // FLIP: snapshot before DOM update
                    const oldRects = snapshotRects();
                    // onReorder must synchronously update the DOM
                    config.onReorder(fromIndex, toIndex);
                    // FLIP: animate from old to new positions
                    animateFlip(oldRects);
                },
            }),
        );
    }

    bind();

    return {
        cleanup() {
            for (const fn of cleanupFns) fn();
            cleanupFns = [];
        },
        reconnect() {
            for (const child of Array.from(container.children)) {
                const el = child as HTMLElement;
                el.style.transform = "";
                el.style.transition = "";
            }
            bind();
        },
    };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run compile
```

Expected: no errors related to `sortable.ts`. There may be pre-existing errors in other files — ignore those.

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/popup/scripts/lib/sortable.ts
git commit -m "feat: add sortable module wrapping Pragmatic DnD with FLIP animation"
```

---

### Task 3: Refactor `favorited-languages.ts`

**Files:**
- Modify: `src/entrypoints/popup/scripts/favorited-languages.ts`

Key changes:
- Remove all 6 drag handler functions and `draggedIndex` state
- Remove `draggable="true"`, `data-index`, and all `@drag*` bindings from template
- Switch `langCodes.map(...)` to `repeat(langCodes, code => code, ...)` for keyed DOM reuse (required for FLIP — `map()` patches nodes in-place, `repeat()` physically moves them)
- Add `initSortable()` integration with lifecycle management
- `handleReorder` calls `rerender()` after `Settings.langCodes.set()` for synchronous DOM update (the in-memory cache updates synchronously via `browserStorageLocalSV.set()`, so `get()` returns new data immediately; `rerender()` triggers `render()` synchronously)

**Important context:**
- `browserStorageLocalSV.set()` updates the in-memory `Map` synchronously, then writes to `browser.storage.local` asynchronously
- `Settings.langCodes.subscribe(renderApp)` in `main.ts` fires on the async `browser.storage.onChanged` event — NOT synchronously
- Therefore `handleReorder` must call `rerender()` explicitly after `set()` to ensure the DOM is updated before FLIP runs
- The later async subscription re-render is a harmless no-op (same data)

- [ ] **Step 1: Rewrite `favorited-languages.ts`**

Replace the entire file contents with:

```typescript
import { Settings } from "@/common/settings";
import { html, nothing } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { getNameOfCode } from "./lib/languages";
import { initSortable, type SortableInstance } from "./lib/sortable";

export function createFavoritedLanguages(rerender: () => void) {
    let sortable: SortableInstance | null = null;
    let prevCodes: string[] = [];

    function handleRemove(code: string) {
        Settings.langCodes.remove(code);
    }

    function handleReorder(fromIndex: number, toIndex: number) {
        const codes = [...Settings.langCodes.get()];
        const [moved] = codes.splice(fromIndex, 1);
        codes.splice(toIndex, 0, moved);
        Settings.langCodes.set(codes);
        rerender();
    }

    function languageTagTemplate(code: string) {
        const name = getNameOfCode(code);
        return html`
            <span class="language-tag" data-code="${code}">
                <span class="tag-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none">
                        <path
                            d="M8 6h2M8 12h2M8 18h2M14 6h2M14 12h2M14 18h2"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </svg>
                </span>
                <span class="tag-content">
                    <span class="tag-name">${name}</span>
                    <span class="tag-code">${code}</span>
                </span>
                <button
                    class="tag-remove"
                    title="Remove ${name}"
                    @click=${() => handleRemove(code)}
                >
                    <svg viewBox="0 0 24 24" fill="none">
                        <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </svg>
                </button>
            </span>
        `;
    }

    return function template() {
        const langCodes = Settings.langCodes.get();

        // Cleanup sortable when list becomes empty
        if (langCodes.length === 0 && sortable) {
            sortable.cleanup();
            sortable = null;
        }

        // Init or reconnect sortable after render
        if (langCodes.length > 0) {
            requestAnimationFrame(() => {
                const container = document.querySelector(
                    ".selected-languages",
                ) as HTMLElement | null;
                if (!container) return;

                if (!sortable) {
                    sortable = initSortable(container, {
                        onReorder: handleReorder,
                        getHandle: (el) =>
                            el.querySelector(".tag-drag-handle"),
                    });
                } else if (langCodes.join() !== prevCodes.join()) {
                    // Reconnect when items added/removed (not after reorder —
                    // repeat() preserves DOM nodes on reorder, so bindings survive)
                    sortable.reconnect();
                }
            });
        }

        prevCodes = langCodes;

        return html`
            <div class="favorites-section">
                <div class="favorites-header">
                    <span class="favorites-label">Favorited Languages</span>
                    ${langCodes.length > 0
                        ? html`<span class="favorites-count"
                              >${langCodes.length}</span
                          >`
                        : nothing}
                </div>
                ${langCodes.length > 0
                    ? html`
                          <div class="selected-languages">
                              ${repeat(
                                  langCodes,
                                  (code) => code,
                                  (code) => languageTagTemplate(code),
                              )}
                          </div>
                      `
                    : html`
                          <div class="favorites-empty">
                              <span
                                  >No favorited languages yet. Search and add
                                  languages above.</span
                              >
                          </div>
                      `}
            </div>
        `;
    };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run compile
```

Expected: passes (or only pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/popup/scripts/favorited-languages.ts
git commit -m "refactor: replace manual DnD handlers with sortable module + repeat directive"
```

---

### Task 4: Update CSS for FLIP compatibility

**Files:**
- Modify: `src/entrypoints/popup/style.css:401, 413-417`

Two CSS fixes:
1. `transition: all` on `.language-tag` conflicts with FLIP's JS-applied `transform` transition — replace with explicit properties
2. `.language-tag.dragging` has `transform: scale(0.98)` which corrupts FLIP rect snapshots — Pragmatic DnD's `draggable.onDrop` removes `.dragging` before `monitorForElements.onDrop` fires, but during the same event loop the browser may not have recomputed layout without the scale. Remove the transform and rely on opacity alone for the dragging visual.

- [ ] **Step 1: Update `.language-tag` transition**

In `src/entrypoints/popup/style.css`, change line 401:

```css
/* Before */
transition: all var(--transition-fast);

/* After */
transition: background var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
```

- [ ] **Step 2: Remove `transform: scale(0.98)` from `.language-tag.dragging`**

In `src/entrypoints/popup/style.css`, change lines 413-417:

```css
/* Before */
.language-tag.dragging {
    opacity: 0.4;
    background: var(--bg-input);
    transform: scale(0.98);
}

/* After */
.language-tag.dragging {
    opacity: 0.4;
    background: var(--bg-input);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/popup/style.css
git commit -m "fix: CSS adjustments for FLIP animation compatibility"
```

---

### Task 5: Build and verify

- [ ] **Step 1: Type-check**

```bash
npm run compile
```

Expected: passes.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: builds successfully with no errors.

- [ ] **Step 3: Manual test**

```bash
npm run dev
```

Open the extension popup and verify:
1. Language tags display correctly
2. Dragging a tag via the handle shows `.dragging` visual (opacity)
3. Hovering over another tag during drag shows `.drag-over` visual (blue border)
4. Dropping reorders the list with a smooth slide animation
5. Adding a new language works (tag appears, becomes draggable)
6. Removing a language works (tag disappears, remaining tags still draggable)
7. Dragging after add/remove still works (reconnect fires)

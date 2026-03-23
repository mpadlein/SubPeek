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
            const timeoutId = setTimeout(() => {
                el.style.transition = "";
            }, FLIP_DURATION_MS + 50);
            el.addEventListener(
                "transitionend",
                () => {
                    clearTimeout(timeoutId);
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
                    canDrop: ({ source }) => source.element !== child,
                    onDragEnter: ({ source }) => {
                        // Live reorder: items slide out of the way during drag
                        const fromIndex = getIndex(source.element);
                        const toIndex = getIndex(child);
                        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

                        const oldRects = snapshotRects();
                        config.onReorder(fromIndex, toIndex);
                        animateFlip(oldRects);
                    },
                }),
            );
        }

        // Monitor for cleanup on drop
        cleanupFns.push(
            monitorForElements({
                onDrop: () => {
                    for (const c of Array.from(container.children)) {
                        (c as HTMLElement).classList.remove("dragging");
                    }
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

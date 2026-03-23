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

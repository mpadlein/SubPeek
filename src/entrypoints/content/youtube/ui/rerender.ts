import { CSS, EVENT } from "../../constants";

/**
 * Asks every mounted embed to redraw itself. Each container listens for the
 * render event (registered in initEmbed()) and redraws its badges and its
 * card's filter state from what it already knows, so this costs no lookups.
 * main.ts calls it when the favorites change, filter.ts when the switch is
 * toggled.
 */
export function rerenderEmbeds(): void {
    document.querySelectorAll(`.${CSS.CONTAINER}`).forEach((el) => {
        el.dispatchEvent(new CustomEvent(EVENT.RENDER));
    });
}

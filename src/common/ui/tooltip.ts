import { noChange } from "lit-html";
import { AsyncDirective, directive } from "lit-html/async-directive.js";
import type { ElementPart } from "lit-html/directive.js";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipOptions {
    position?: TooltipPosition;
    delay?: number;
}

const DEFAULTS: Required<TooltipOptions> = {
    position: "top",
    delay: 300,
};

let styleInjected = false;

function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;

    const style = document.createElement("style");
    style.textContent = `
        .ui-tooltip {
            position: fixed;
            z-index: 10000;
            max-width: 250px;
            padding: 8px 12px;
            background: #2a2a2e;
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            font-weight: 400;
            line-height: 1.5;
            word-wrap: break-word;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 1px 4px rgba(0, 0, 0, 0.2);
            pointer-events: auto;
            opacity: 0;
            transform: scale(0.96);
            transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .ui-tooltip.visible {
            opacity: 1;
            transform: scale(1);
        }
        .ui-tooltip::after {
            content: "";
            position: absolute;
            border: 5px solid transparent;
        }
        .ui-tooltip[data-position="top"]::after {
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-top-color: #2a2a2e;
        }
        .ui-tooltip[data-position="bottom"]::after {
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-bottom-color: #2a2a2e;
        }
        .ui-tooltip[data-position="left"]::after {
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            border-left-color: #2a2a2e;
        }
        .ui-tooltip[data-position="right"]::after {
            right: 100%;
            top: 50%;
            transform: translateY(-50%);
            border-right-color: #2a2a2e;
        }
    `;
    document.head.appendChild(style);
}

const ARROW_SIZE = 5;
const GAP = 4;

function positionTooltip(
    tip: HTMLElement,
    host: Element,
    position: TooltipPosition,
) {
    const hostRect = host.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top: number;
    let left: number;

    switch (position) {
        case "top":
            top = hostRect.top - tipRect.height - ARROW_SIZE - GAP;
            left = hostRect.left + (hostRect.width - tipRect.width) / 2;
            break;
        case "bottom":
            top = hostRect.bottom + ARROW_SIZE + GAP;
            left = hostRect.left + (hostRect.width - tipRect.width) / 2;
            break;
        case "left":
            top = hostRect.top + (hostRect.height - tipRect.height) / 2;
            left = hostRect.left - tipRect.width - ARROW_SIZE - GAP;
            break;
        case "right":
            top = hostRect.top + (hostRect.height - tipRect.height) / 2;
            left = hostRect.right + ARROW_SIZE + GAP;
            break;
    }

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
}

const HIDE_GRACE_MS = 100;

class TooltipDirective extends AsyncDirective {
    private host: Element | null = null;
    private tipEl: HTMLElement | null = null;
    private showTimer: ReturnType<typeof setTimeout> | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private text = "";
    private options: Required<TooltipOptions> = DEFAULTS;

    private cancelHide() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    private scheduleHide() {
        this.cancelHide();
        this.hideTimer = setTimeout(() => this.hide(), HIDE_GRACE_MS);
    }

    private onMouseEnter = () => {
        this.cancelHide();
        if (!this.tipEl) {
            this.showTimer = setTimeout(() => this.show(), this.options.delay);
        }
    };

    private onMouseLeave = () => {
        this.clearShowTimer();
        this.scheduleHide();
    };

    private onTipMouseEnter = () => {
        this.cancelHide();
    };

    private onTipMouseLeave = () => {
        this.scheduleHide();
    };

    private onFocusIn = () => {
        this.cancelHide();
        if (!this.tipEl) {
            this.showTimer = setTimeout(() => this.show(), this.options.delay);
        }
    };

    private onFocusOut = () => {
        this.clearShowTimer();
        this.scheduleHide();
    };

    private clearShowTimer() {
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    override update(part: ElementPart, [text, options]: [string, TooltipOptions?]) {
        if (this.host !== part.element) {
            this.detach();
            this.host = part.element;
            this.attach();
        }
        this.text = text;
        this.options = { ...DEFAULTS, ...options };
        if (this.tipEl) {
            this.tipEl.textContent = text;
            this.tipEl.dataset.position = this.options.position;
            positionTooltip(this.tipEl, this.host!, this.options.position);
        }
        return noChange;
    }

    render(_text: string, _options?: TooltipOptions) {
        return noChange;
    }

    private attach() {
        if (!this.host) return;
        injectStyles();
        this.host.addEventListener("mouseenter", this.onMouseEnter);
        this.host.addEventListener("mouseleave", this.onMouseLeave);
        this.host.addEventListener("focusin", this.onFocusIn);
        this.host.addEventListener("focusout", this.onFocusOut);
    }

    private detach() {
        if (!this.host) return;
        this.host.removeEventListener("mouseenter", this.onMouseEnter);
        this.host.removeEventListener("mouseleave", this.onMouseLeave);
        this.host.removeEventListener("focusin", this.onFocusIn);
        this.host.removeEventListener("focusout", this.onFocusOut);
        this.hide();
    }

    private show() {
        if (!this.host || !this.text) return;

        this.tipEl = document.createElement("div");
        this.tipEl.className = "ui-tooltip";
        this.tipEl.dataset.position = this.options.position;
        this.tipEl.textContent = this.text;
        this.tipEl.addEventListener("mouseenter", this.onTipMouseEnter);
        this.tipEl.addEventListener("mouseleave", this.onTipMouseLeave);
        document.body.appendChild(this.tipEl);

        positionTooltip(this.tipEl, this.host, this.options.position);
        requestAnimationFrame(() => {
            this.tipEl?.classList.add("visible");
        });
    }

    private hide() {
        this.clearShowTimer();
        this.cancelHide();
        if (this.tipEl) {
            this.tipEl.removeEventListener("mouseenter", this.onTipMouseEnter);
            this.tipEl.removeEventListener("mouseleave", this.onTipMouseLeave);
            this.tipEl.remove();
            this.tipEl = null;
        }
    }

    protected override disconnected() {
        this.detach();
    }

    protected override reconnected() {
        this.attach();
    }
}

export const tooltip = directive(TooltipDirective);

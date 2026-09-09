import { TemplateResult, html } from "lit-html";

export function svgIconTemplate(path: string, size = 18): TemplateResult {
    return html`
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="${size}"
            height="${size}"
        >
            <path d="${path}" fill="currentColor" />
        </svg>
    `;
}

/**
 * The SubPeek logo (eyes peeking over a subtitle bar). This is the small-size
 * variant of `store-assets/icon.svg`: the label chip is dropped and the two
 * caption lines are equal length so it stays legible at 16-32px.
 */
export function logoTemplate(size = 20): TemplateResult {
    return html`
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 128 128"
            width="${size}"
            height="${size}"
            aria-hidden="true"
        >
            <rect width="128" height="128" rx="34" fill="#e0202b" />
            <circle cx="46" cy="56" r="16" fill="#ffffff" />
            <circle cx="82" cy="56" r="16" fill="#ffffff" />
            <circle cx="52" cy="57" r="7" fill="#0f0f0f" />
            <circle cx="88" cy="57" r="7" fill="#0f0f0f" />
            <rect x="18" y="62" width="92" height="46" rx="15" fill="#0f0f0f" />
            <rect x="30" y="76" width="68" height="9" rx="4.5" fill="#ffffff" />
            <rect x="30" y="91" width="68" height="9" rx="4.5" fill="#ffffff" />
        </svg>
    `;
}

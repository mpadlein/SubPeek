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

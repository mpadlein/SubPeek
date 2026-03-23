import { CSS, EVENT } from "./constants";
import { metricsProxy } from "./debugging";
import { initEmbed } from "./youtube/ui/embed";

const srcObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        const img = mutation.target as HTMLImageElement;
        const anchor = img.closest('a[href^="/watch?"]') as HTMLAnchorElement;
        if (!anchor) continue;

        const newVideoUrl = anchor.href;
        const wrapper = img.closest(`.${CSS.THUMBNAIL_WRAPPER}`);
        const container = wrapper?.querySelector(
            `.${CSS.CONTAINER}`,
        ) as HTMLElement;
        if (
            !container ||
            !newVideoUrl ||
            newVideoUrl === container.dataset.href
        )
            continue;

        const newContainer = createEmbedContainer(newVideoUrl);
        container.replaceWith(newContainer);
        initEmbed(newContainer, newVideoUrl);
    }
});

const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            metricsProxy.itsOsvMatch++;
            const element = entry.target as HTMLElement;
            element.dispatchEvent(new CustomEvent(EVENT.ELEMENT_VISIBLE));
            intersectionObserver.unobserve(element);
        }
    }
});
function observeImg(img: HTMLImageElement) {
    img.addEventListener(EVENT.ELEMENT_VISIBLE, () => {
        mountOverlay(img);
    });

    intersectionObserver.observe(img);
    metricsProxy.itsOsv++;
}

const imgAddedObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const element = node as HTMLElement;

                let img: HTMLImageElement | null = null;
                switch (element.tagName) {
                    case "IMG":
                        if (element.closest('a[href^="/watch?"]')) {
                            img = element as HTMLImageElement;
                        }
                        break;
                    case "A":
                        if (
                            element.getAttribute("href")?.startsWith("/watch?")
                        ) {
                            img = element.querySelector(
                                "img",
                            ) as HTMLImageElement;
                        }
                        break;
                    default:
                        img = element.querySelector(
                            'a[href^="/watch?"] img',
                        ) as HTMLImageElement;
                        break;
                }
                if (!img) return;
                if (img.getAttribute("processed") === "true") return;
                img.setAttribute("processed", "true");
                observeImg(img);
            });
        }
    }
});

function createEmbedContainer(videoUrl: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add(
        CSS.CONTAINER,
        CSS.CONTAINER_THUMBNAIL,
        CSS.CORNER_BOTTOM_LEFT,
    );
    container.dataset.href = videoUrl;
    container.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    return container;
}

function mountOverlay(img: HTMLImageElement) {
    const anchor = img.closest('a[href^="/watch?"]') as HTMLAnchorElement;
    if (!anchor) return;

    const videoUrl = anchor.href;
    if (!videoUrl) return;

    const imgParent = img.parentElement as HTMLElement;

    const wrapper = document.createElement("div");
    wrapper.classList.add(CSS.THUMBNAIL_WRAPPER);

    try {
        imgParent.appendChild(wrapper);
    } catch (error) {
        logger.error("imgParent not found", img);
        return;
    }

    wrapper.appendChild(img);

    const container = createEmbedContainer(videoUrl);
    wrapper.appendChild(container);
    initEmbed(container, videoUrl);

    srcObserver.observe(img, { attributes: true, attributeFilter: ["src"] });
}

export default function start(): void {
    imgAddedObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}

// CSS class names (BEM) and DOM event names used by the content script.

// Class-name prefix; must match $prefix in youtube/styles/_variables.scss.
export const CSS_PREFIX = "ytbext";

// CSS Block Names
export const CSS = {
    // Badge container
    CONTAINER: `${CSS_PREFIX}-embed-container`,
    CONTAINER_THUMBNAIL: `${CSS_PREFIX}-embed-container--thumbnail`,
    CORNER_BOTTOM_LEFT: `${CSS_PREFIX}-corner--bottom-left`,
    THUMBNAIL_WRAPPER: `${CSS_PREFIX}-thumbnail-wrapper`,
    PREVIEW_HOST: `${CSS_PREFIX}-preview-host`,
    ITEM: `${CSS_PREFIX}-item`,
    BADGE: `${CSS_PREFIX}-badge`,
    BADGE_MORE: `${CSS_PREFIX}-badge--more`,
    BADGES: `${CSS_PREFIX}-badges`,
    ICON: `${CSS_PREFIX}-icon`,
    ICON_ACTIVE: `${CSS_PREFIX}-icon--active`,

    // Popup
    POPUP: `${CSS_PREFIX}-popup`,
    POPUP_HEADER: `${CSS_PREFIX}-popup__header`,
    POPUP_LOGO: `${CSS_PREFIX}-popup__logo`,
    POPUP_LIST: `${CSS_PREFIX}-popup__list`,
    POPUP_ITEM: `${CSS_PREFIX}-popup__item`,
    POPUP_ITEM_NAME: `${CSS_PREFIX}-popup__item-name`,
    POPUP_ITEM_ACTIONS: `${CSS_PREFIX}-popup__item-actions`,
    POPUP_ITEM_CODE: `${CSS_PREFIX}-popup__item-code`,
    POPUP_ITEM_ACTION: `${CSS_PREFIX}-popup__item-action`,
    POPUP_HEADER_ACTIONS: `${CSS_PREFIX}-popup__header-actions`,
    POPUP_HEADER_ACTION: `${CSS_PREFIX}-popup__header-action`,
    POPUP_HEADER_ACTION_DANGER: `${CSS_PREFIX}-popup__header-action--danger`,

    // Modifiers
    MOD_FAVORITE: "is-favorite",
    MOD_TOP: "is-top",
    MOD_BOTTOM: "is-bottom",

    // Loading
    LOADING_SPINNER: `${CSS_PREFIX}-loading__spinner`,

    // Tooltip
    TOOLTIP: `${CSS_PREFIX}-tooltip`,
    TOOLTIP_TEXT: `${CSS_PREFIX}-tooltip__text`,
} as const;

const EVENT_PREFIX = "ytbext";
export const EVENT = {
    RENDER: `${EVENT_PREFIX}:render`,
} as const;

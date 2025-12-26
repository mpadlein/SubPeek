* USER SETTING:
- favoriteLanguages: array of language codes (ordered)
- showAudioTrack: optional feature
- cacheTTL: time to live for cache
- simpleUI: only show "cc" icon when any language matched


* BACKGROUND SCRIPT
- VideoInfoCache: use indexedDB

* Content script
- MutationObserver observe new video cards -> use IntersectionObserver to detect when card is visible -> render and use MutationObserver to check for anchor change href
- EmbedComponent: 
    + render data
    + listen to FavoritedChange -> update
- Popup: 
    + can add/remove languages -> emit event FavoritedChange
    + listen to FavoritedChange -> update

* POPUP SCRIPT
- Show favorited: can delete, organize order -> emit event FavoritedChange
- Search bar to add languages -> emit event FavoritedChange
- Hide settings that too advanced, click to show

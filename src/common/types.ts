export interface Settings {
    langCodes: string[];
    cacheTTL: number;
    renderEmpty: boolean;
    renderAudio: boolean;
}

export interface CaptionTrack {
    languageCode: string;
    name: string;
    auto: boolean;
    url: string;
}

/** Audio track info */
export interface AudioTrack {
    languageCode: string;
    name: string;
    origin: boolean;
}

/** Combined video info containing captions and audio tracks */
export interface VideoInfo {
    captions: CaptionTrack[];
    audioTracks: AudioTrack[];
}

/** Cache entry for IndexedDB storage */
export interface CacheEntry {
    videoId: string;
    data: VideoInfo;
    timestamp: number;
}

export type TrackItem = CaptionTrack | AudioTrack;

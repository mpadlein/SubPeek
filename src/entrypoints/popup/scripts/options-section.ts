import { Settings } from "@/common/settings";
import { html } from "lit-html";

export function createOptionsSection(rerender: () => void) {
    function handleCacheTTLChange(e: Event) {
        Settings.cacheTTL.set(
            parseInt((e.target as HTMLSelectElement).value, 10),
        );
    }

    function handleRenderEmptyChange(e: Event) {
        Settings.renderEmpty.set((e.target as HTMLInputElement).checked);
    }

    function handleRenderAudioChange(e: Event) {
        Settings.renderAudio.set((e.target as HTMLInputElement).checked);
    }

    return function template() {
        const cacheTTL = Settings.cacheTTL.get().toString();
        const renderEmpty = Settings.renderEmpty.get();
        const renderAudio = Settings.renderAudio.get();

        return html`
            <section class="settings-card">
                <div class="card-header">
                    <h2>Options</h2>
                </div>

                <div class="option-row">
                    <div class="option-info">
                        <label for="cache-ttl">Video Cache TTL</label>
                        <span class="option-description"
                            >How long to cache video data</span
                        >
                    </div>
                    <select
                        id="cache-ttl"
                        class="select-input"
                        .value=${cacheTTL}
                        @change=${handleCacheTTLChange}
                    >
                        <option value="1800">30 minutes</option>
                        <option value="3600">1 hour</option>
                        <option value="10800">3 hours</option>
                        <option value="21600">6 hours</option>
                        <option value="43200">12 hours</option>
                        <option value="86400">24 hours</option>
                    </select>
                </div>

                <div class="option-row">
                    <div class="option-info">
                        <label for="render-empty">Render Empty Badges</label>
                        <span class="option-description"
                            >Show badges when no captions found</span
                        >
                    </div>
                    <label class="toggle-switch">
                        <input
                            type="checkbox"
                            id="render-empty"
                            .checked=${renderEmpty}
                            @change=${handleRenderEmptyChange}
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <div class="option-row">
                    <div class="option-info">
                        <label for="render-audio">Render Audio Badges</label>
                        <span class="option-description"
                            >Show badges when no audio found</span
                        >
                    </div>
                    <label class="toggle-switch">
                        <input
                            type="checkbox"
                            id="render-audio"
                            .checked=${renderAudio}
                            @change=${handleRenderAudioChange}
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </section>
        `;
    };
}

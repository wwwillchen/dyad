import {LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('dyad-gist-fetcher')
export class GistFetcher extends LitElement {
  @property({type: String}) gistId = '';
  @property({type: String}) gistFile = '';
  @property({type: String}) gistLoadedEvent = '';
  @property({type: Boolean}) autoFetch = true;
  @property({type: String}) fetchError = '';
  @property({type: Boolean}) loading = false;

  // Cache keys
  private static CACHE_ID_KEY = 'dyad_cached_gist_id';
  private static CACHE_DATA_KEY = 'dyad_cached_gist_data';

  override connectedCallback() {
    super.connectedCallback();

    if (this.autoFetch && this.gistId) {
      this.fetchGist();
    }
  }

  async fetchGist() {
    if (!this.gistId) {
      this.fetchError = 'No gist ID provided';
      return;
    }

    this.loading = true;
    this.fetchError = '';

    try {
      // Check if we have this specific gist cached
      const cachedId = localStorage.getItem(GistFetcher.CACHE_ID_KEY);
      let gistData: any;

      if (cachedId === this.gistId) {
        const cachedData = localStorage.getItem(GistFetcher.CACHE_DATA_KEY);
        if (cachedData) {
          gistData = JSON.parse(cachedData);
        }
      }

      // If not cached, fetch from API
      if (!gistData) {
        const response = await fetch(
          `https://api.github.com/gists/${this.gistId}`,
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch gist: ${response.status} ${response.statusText}`,
          );
        }

        gistData = await response.json();

        // Store only this one gist in cache
        try {
          localStorage.setItem(GistFetcher.CACHE_ID_KEY, this.gistId);
          localStorage.setItem(
            GistFetcher.CACHE_DATA_KEY,
            JSON.stringify(gistData),
          );
        } catch (e) {
          console.warn('Failed to cache gist:', e);
        }
      }

      // Process the gist data (cached or fresh)
      let result: any;
      if (this.gistFile && gistData.files[this.gistFile]) {
        result = {
          filename: this.gistFile,
          content: gistData.files[this.gistFile].content,
          language: gistData.files[this.gistFile].language,
        };
      } else {
        result = Object.keys(gistData.files).reduce((acc: any, filename) => {
          acc[filename] = {
            content: gistData.files[filename].content,
            language: gistData.files[filename].language,
          };
          return acc;
        }, {});
      }

      const fromCache = cachedId === this.gistId;

      // Emit the event with the gist data
      if (this.gistLoadedEvent) {
        this.dispatchEvent(
          new MesopEvent(this.gistLoadedEvent, {
            gist: result,
            id: this.gistId,
            fromCache,
          }),
        );
      }
    } catch (error) {
      console.error('Error fetching gist:', error);
      this.fetchError =
        error instanceof Error ? error.message : 'Unknown error';

      // Emit error event
      if (this.gistLoadedEvent) {
        this.dispatchEvent(
          new MesopEvent(this.gistLoadedEvent, {
            error: this.fetchError,
            gistId: this.gistId,
          }),
        );
      }
    } finally {
      this.loading = false;
    }
  }
}

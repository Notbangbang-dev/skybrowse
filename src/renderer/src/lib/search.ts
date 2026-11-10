export interface SearchEngine {
    id: string;
    name: string;
    queryUrl: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
    { id: "google", name: "Google", queryUrl: "https://www.google.com/search?q=" },
    { id: "bing", name: "Bing", queryUrl: "https://www.bing.com/search?q=" },
    { id: "duckduckgo", name: "DuckDuckGo", queryUrl: "https://duckduckgo.com/?q=" }
];

export const DEFAULT_ENGINE_ID = "google";

export function getSearchEngine(id: string): SearchEngine {
    return SEARCH_ENGINES.find(engine => engine.id === id) ?? SEARCH_ENGINES[0];
}

export function searchUrl(engineId: string, query: string): string {
    const engine = getSearchEngine(engineId);
    return `${engine.queryUrl}${encodeURIComponent(query)}`;
}

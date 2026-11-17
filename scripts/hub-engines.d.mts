// Types for scripts/hub-engines.mjs (used by src/test/engines.test.ts).
export interface WikidataEngine { id: string; label: string; engine: boolean }
export interface WikidataCache { steam?: Record<string, WikidataEngine[]>; igdb?: Record<string, WikidataEngine[]>; steamIgdb?: Record<string, string[]> }
export const CACHE_FILE: string;
export const OUT_FILE: string;
export const ENGINE_MIN_HANDLERS: number;
export const ENGINE_MIN_FACTOR: number;
export const ENGINE_MIN_POINTS: number;
export const ENGINE_NAMES: Record<string, string>;
export function engineFamily(label: string): string;
export function classifyCode(src: string, opts?: { definite?: boolean }): string;
export function classifyWikidata(engines: WikidataEngine[] | undefined): string;
export function steamIdOf(src: string): string;
export function igdbSlugOf(url: string | undefined): string;
export function classify(src: string, cache: WikidataCache | null, igdbSlug?: string): { engine: string; source: '' | 'wikidata' | 'code'; via?: 'steam' | 'igdb' };
export function notableEngines(use: Record<string, number> | undefined, n: number, totals: Record<string, number>, handlers: number): { family: string; used: number; total: number; share: number }[];
export function engineLine(use: Record<string, number> | undefined, n: number, totals: Record<string, number>, handlers: number): string;

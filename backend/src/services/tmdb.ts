import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_REQUEST_TIMEOUT_MS = 5000;

// Minimal shape of what TMDb's /search/multi returns — just the fields we
// actually read. Avoids `any` and catches typos in field names at compile time.
interface TmdbSearchItem {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  genre_ids?: number[];
}

interface SearchResult {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  poster: string | null;
  year: string | null;
  genreIds: number[];
}

interface TitleDetails {
  title: string;
  poster: string | null;
  year: string | null;
}

export interface FullTitleDetails extends TitleDetails {
  overview: string;
  genres: GenreResult[];
  runtime: number | null;
  seasons: Array<{
    id: number;
    name: string;
    episodeCount: number;
  }>;
}

interface TmdbDiscoverItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
}

interface TmdbGenre {
  id: number;
  name: string;
}

export type TmdbTitleType = 'movie' | 'tv';
export interface GenreResult {
  id: number;
  name: string;
}

// Prisma enum members can't contain hyphens, so the language is stored with
// underscores (es_ES) and converted to TMDb's hyphenated format (es-ES) at
// the API boundary. Keep this list in sync with the Language enum in schema.prisma.
const DB_LANGUAGE_TO_TMDB = {
  es_ES: 'es-ES',
  en_US: 'en-US',
  pt_BR: 'pt-BR',
  fr_FR: 'fr-FR',
  de_DE: 'de-DE',
} as const;

type DbLanguage = keyof typeof DB_LANGUAGE_TO_TMDB;
export type TmdbLanguage = (typeof DB_LANGUAGE_TO_TMDB)[DbLanguage];
export const ALLOWED_LANGUAGES = Object.values(DB_LANGUAGE_TO_TMDB) as TmdbLanguage[];

// Reverse lookup, generated once from the map above instead of duplicated by hand.
const TMDB_LANGUAGE_TO_DB: Record<TmdbLanguage, DbLanguage> = Object.fromEntries(
  Object.entries(DB_LANGUAGE_TO_TMDB).map(([dbLanguage, tmdbLanguage]) => [tmdbLanguage, dbLanguage])
) as Record<TmdbLanguage, DbLanguage>;

const RECENT_POSTERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_POSTERS_CACHE_SIZE = 60;
const recentPostersCache = new Map<TmdbLanguage, { posters: string[]; fetchedAt: number }>();

export function isTmdbLanguage(value: unknown): value is TmdbLanguage {
  return typeof value === 'string' && ALLOWED_LANGUAGES.includes(value as TmdbLanguage);
}

export function tmdbLanguageToDb(value: TmdbLanguage): DbLanguage {
  return TMDB_LANGUAGE_TO_DB[value];
}

export function dbLanguageToTmdb(value: unknown): TmdbLanguage | null {
  if (typeof value !== 'string' || !(value in DB_LANGUAGE_TO_TMDB)) {
    return null;
  }

  return DB_LANGUAGE_TO_TMDB[value as DbLanguage];
}

function buildPosterUrl(posterPath: string | null): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
}

function buildAuthHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    throw new Error('TMDB_READ_ACCESS_TOKEN is not defined in .env');
  }
  return { Authorization: `Bearer ${token}` };
}

function getYear(date: string | undefined): string | null {
  return date?.split('-')[0] ?? null;
}

async function fetchTmdbTitle(tmdbId: number, type: TmdbTitleType, language: TmdbLanguage) {
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?language=${encodeURIComponent(language)}`;
  const response = await axios.get(url, {
    headers: buildAuthHeaders(),
    timeout: TMDB_REQUEST_TIMEOUT_MS,
  });
  return response.data;
}

export async function searchTMDb(query: string, language: TmdbLanguage = 'es-ES'): Promise<SearchResult[]> {
  const url = `${TMDB_BASE_URL}/search/multi?language=${encodeURIComponent(language)}&query=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    headers: buildAuthHeaders(),
    timeout: TMDB_REQUEST_TIMEOUT_MS,
  });
  const rawResults: TmdbSearchItem[] = response.data.results || [];

  return rawResults
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .map(item => {
      const isMovie = item.media_type === 'movie';
      const title = (isMovie ? item.title : item.name) ?? '';
      const releaseDate = isMovie ? item.release_date : item.first_air_date;
      const year = releaseDate ? (releaseDate.split('-')[0] ?? null) : null;

      return {
        tmdbId: item.id,
        type: isMovie ? 'movie' : 'tv',
        title,
        poster: buildPosterUrl(item.poster_path),
        year,
        genreIds: item.genre_ids ?? [],
      } as SearchResult;
    });
}

// Intentionally minimal (title/poster/year only) — used for the bulk,
// parallel fetches in GET /watchlist. See getTitleFullDetails for the
// richer version used by the one-off title detail modal.
export async function getTitleDetails(
  tmdbId: number,
  type: 'movie' | 'tv',
  language: TmdbLanguage = 'es-ES'
): Promise<TitleDetails> {
  const data = await fetchTmdbTitle(tmdbId, type, language);

  return {
    title: type === 'movie' ? data.title : data.name,
    poster: buildPosterUrl(data.poster_path),
    year: getYear(type === 'movie' ? data.release_date : data.first_air_date),
  };
}

export async function getTitleFullDetails(
  tmdbId: number,
  type: TmdbTitleType,
  language: TmdbLanguage = 'es-ES'
): Promise<FullTitleDetails> {
  const data = await fetchTmdbTitle(tmdbId, type, language);

  return {
    title: type === 'movie' ? data.title : data.name,
    poster: buildPosterUrl(data.poster_path),
    year: getYear(type === 'movie' ? data.release_date : data.first_air_date),
    overview: data.overview ?? '',
    genres: (data.genres ?? []).map((genre: TmdbGenre) => ({
      id: genre.id,
      name: genre.name,
    })),
    runtime: type === 'movie' ? data.runtime ?? null : null,
    seasons: type === 'tv'
      ? (data.seasons ?? []).map((season: { id: number; name: string; episode_count: number }) => ({
          id: season.id,
          name: season.name,
          episodeCount: season.episode_count,
        }))
      : [],
  };
}

export async function getGenres(type: TmdbTitleType, language: TmdbLanguage): Promise<GenreResult[]> {
  const response = await axios.get(`${TMDB_BASE_URL}/genre/${type}/list`, {
    headers: buildAuthHeaders(),
    params: { language },
    timeout: TMDB_REQUEST_TIMEOUT_MS,
  });

  const genres = (response.data.genres ?? []) as TmdbGenre[];
  return genres.map(({ id, name }) => ({ id, name }));
}

export async function discoverTitles(
  type: TmdbTitleType,
  genreId: number | undefined,
  yearFrom: number | undefined,
  yearTo: number | undefined,
  language: TmdbLanguage
): Promise<SearchResult[]> {
  // TMDb uses a different date-filter param name per type: primary_release_date
  // for movies, first_air_date for TV.
  const datePrefix = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const params: Record<string, string | number> = {
    language,
    sort_by: 'popularity.desc',
  };

  if (genreId !== undefined) {
    params.with_genres = genreId;
  }

  if (yearFrom !== undefined) {
    params[`${datePrefix}.gte`] = `${yearFrom}-01-01`;
  }

  if (yearTo !== undefined) {
    params[`${datePrefix}.lte`] = `${yearTo}-12-31`;
  }

  const response = await axios.get(`${TMDB_BASE_URL}/discover/${type}`, {
    headers: buildAuthHeaders(),
    params,
    timeout: TMDB_REQUEST_TIMEOUT_MS,
  });

  const items = (response.data.results ?? []) as TmdbDiscoverItem[];
  return items.map(item => ({
    tmdbId: item.id,
    type,
    title: (type === 'movie' ? item.title : item.name) ?? '',
    poster: buildPosterUrl(item.poster_path),
    year: getYear(type === 'movie' ? item.release_date : item.first_air_date),
    genreIds: item.genre_ids ?? [],
  }));
}

// Cached per language so the landing page's poster wall doesn't hit TMDb
// on every visit — it refreshes at most once per RECENT_POSTERS_CACHE_TTL_MS.
export async function getRecentPosters(language: TmdbLanguage = 'es-ES', limit = 40): Promise<string[]> {
  const cached = recentPostersCache.get(language);

  if (cached && Date.now() - cached.fetchedAt < RECENT_POSTERS_CACHE_TTL_MS) {
    return cached.posters.slice(0, Math.min(limit, cached.posters.length));
  }

  const headers = buildAuthHeaders();
  const today = new Date().toISOString().slice(0, 10);

  // A single TMDb page only returns 20 results. Fetching two pages per type
  // (40 movies + 40 TV, before filtering) gives enough raw candidates for
  // the pool to actually reach RECENT_POSTERS_CACHE_SIZE.
  const [moviesPage1, moviesPage2, tvPage1, tvPage2] = await Promise.all([
    axios.get(`${TMDB_BASE_URL}/discover/movie?language=${encodeURIComponent(language)}&sort_by=primary_release_date.desc&primary_release_date.lte=${today}&page=1`, { headers, timeout: TMDB_REQUEST_TIMEOUT_MS }),
    axios.get(`${TMDB_BASE_URL}/discover/movie?language=${encodeURIComponent(language)}&sort_by=primary_release_date.desc&primary_release_date.lte=${today}&page=2`, { headers, timeout: TMDB_REQUEST_TIMEOUT_MS }),
    axios.get(`${TMDB_BASE_URL}/discover/tv?language=${encodeURIComponent(language)}&sort_by=first_air_date.desc&first_air_date.lte=${today}&page=1`, { headers, timeout: TMDB_REQUEST_TIMEOUT_MS }),
    axios.get(`${TMDB_BASE_URL}/discover/tv?language=${encodeURIComponent(language)}&sort_by=first_air_date.desc&first_air_date.lte=${today}&page=2`, { headers, timeout: TMDB_REQUEST_TIMEOUT_MS }),
  ]);

  // TMDb has no single endpoint that mixes movies and TV sorted by date, so
  // we fetch each type's most recent releases separately and merge+re-sort here.
  const datedItems = [
    ...[...moviesPage1.data.results, ...moviesPage2.data.results].map((item: TmdbDiscoverItem) => ({
      poster: buildPosterUrl(item.poster_path),
      date: item.release_date,
    })),
    ...[...tvPage1.data.results, ...tvPage2.data.results].map((item: TmdbDiscoverItem) => ({
      poster: buildPosterUrl(item.poster_path),
      date: item.first_air_date,
    })),
  ];

  const posters = datedItems
    .filter((item): item is { poster: string; date: string } => Boolean(item.poster && item.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_POSTERS_CACHE_SIZE)
    .map(item => item.poster);

  recentPostersCache.set(language, { posters, fetchedAt: Date.now() });
  return posters.slice(0, Math.min(limit, posters.length));
}
import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

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
}

interface SearchResult {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  poster: string | null;
  year: string | null;
}

interface TitleDetails {
  title: string;
  poster: string | null;
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

export async function searchTMDb(query: string): Promise<SearchResult[]> {
  const url = `${TMDB_BASE_URL}/search/multi?language=es-ES&query=${encodeURIComponent(query)}`;
  const response = await axios.get(url, { headers: buildAuthHeaders() });
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
      } as SearchResult;
    });
}

export async function getTitleDetails(tmdbId: number, type: 'movie' | 'tv'): Promise<TitleDetails> {
  const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?language=es-ES`;
  const response = await axios.get(url, { headers: buildAuthHeaders() });
  const data = response.data;

  return {
    title: type === 'movie' ? data.title : data.name,
    poster: buildPosterUrl(data.poster_path),
  };
}
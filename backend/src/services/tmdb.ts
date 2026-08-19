import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface ResultadoBusqueda {
  tmdbId: number;
  tipo: 'movie' | 'tv';
  titulo: string;
  poster: string | null;
  anio: string | null;
}

interface DetalleTMDb {
  titulo: string;
  poster: string | null;
}

function construirUrlPoster(posterPath: string | null): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
}

function headersAuth() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    throw new Error('TMDB_READ_ACCESS_TOKEN no está definida en el .env');
  }
  return { Authorization: `Bearer ${token}` };
}

export async function buscarEnTMDb(query: string): Promise<ResultadoBusqueda[]> {
  const url = `${TMDB_BASE_URL}/search/multi?language=es-ES&query=${encodeURIComponent(query)}`;
  const respuesta = await axios.get(url, { headers: headersAuth() });
  const resultadosCrudos = respuesta.data.results || [];

  return resultadosCrudos
    .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
    .map((item: any) => {
      const titulo = item.media_type === 'movie' ? item.title : item.name;
      const fechaOriginal = item.media_type === 'movie' ? item.release_date : item.first_air_date;
      const anio = fechaOriginal ? fechaOriginal.split('-')[0] : null;

      return {
        tmdbId: item.id,
        tipo: item.media_type,
        titulo,
        poster: construirUrlPoster(item.poster_path),
        anio,
      };
    });
}

export async function obtenerDetalleTMDb(tmdbId: number, tipo: string): Promise<DetalleTMDb> {
  const endpoint = tipo === 'movie' ? 'movie' : 'tv';
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?language=es-ES`;
  const respuesta = await axios.get(url, { headers: headersAuth() });
  const data = respuesta.data;

  return {
    titulo: tipo === 'movie' ? data.title : data.name,
    poster: construirUrlPoster(data.poster_path),
  };
}
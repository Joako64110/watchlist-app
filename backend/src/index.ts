import 'dotenv/config';
import express, { Request, Response } from 'express';
import { PrismaClient, Prisma } from './generated/prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import { authenticateJWT, getJwtSecret, AuthenticatedRequest } from './middleware/auth';
import {
  searchTMDb,
  getTitleDetails,
  ALLOWED_LANGUAGES,
  TmdbLanguage,
  isTmdbLanguage,
  dbLanguageToTmdb,
  tmdbLanguageToDb,
} from './services/tmdb';

const app = express();
const PORT = 3000;
const prisma = new PrismaClient();

// Allowed values for watchlist item fields. Validating against these lists
// (instead of trusting any string) keeps the stored data consistent and
// prevents garbage values from reaching TMDb requests downstream.
const ALLOWED_TYPES = ['movie', 'tv'] as const;
const ALLOWED_STATUSES = ['pending', 'watching', 'watched'] as const;

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function getUserLanguage(userId: number): Promise<TmdbLanguage | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { language: true },
  });

  if (!user) {
    return null;
  }

  return dbLanguageToTmdb(user.language) ?? null;
}

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));

app.get('/', (_req: Request, res: Response) => {
  res.send('hello world');
});

app.post('/auth/register', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!isValidEmail(email) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'A valid email and a password of at least 8 characters are required' });
    }

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return res.status(400).json({ error: 'name must be a string of at most 100 characters' });
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        name
      },
      select: {
        id: true,
        email: true,
        name: true,
        language: true,
        createdAt: true,
      },
    });

    const responseLanguage = dbLanguageToTmdb(newUser.language);

    res.status(201).json({ ...newUser, language: responseLanguage });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    console.error(error);
    res.status(500).json({ error: 'An error occurred while creating the user' });
  }
});

app.post('/auth/login', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.error(`[LOGIN FAILED] Email not found: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.error(`[LOGIN FAILED] Incorrect password for: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let jwtSecret: string;
    try {
      jwtSecret = getJwtSecret();
    } catch {
      console.error('CRITICAL ERROR: JWT_SECRET is not defined in .env');
      return res.status(500).json({ error: 'Internal server error' });
    }

    const payload = { id: user.id, email: user.email };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

    return res.status(200).json({ token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'An error occurred while logging in' });
  }
});

app.patch('/users/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authenticatedUserId = req.user?.id;
    const { language } = req.body;

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (typeof language !== 'string' || !isTmdbLanguage(language)) {
      return res.status(400).json({ error: `language must be one of: ${ALLOWED_LANGUAGES.join(', ')}` });
    }

    const updatedUser = await prisma.user.update({
      where: { id: authenticatedUserId },
      data: { language: tmdbLanguageToDb(language) },
      select: { id: true, email: true, name: true, language: true },
    });

    const responseLanguage = dbLanguageToTmdb(updatedUser.language);

    if (!responseLanguage) {
      return res.status(500).json({ error: 'Stored user language is invalid' });
    }

    return res.status(200).json({
      ...updatedUser,
      language: responseLanguage,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'An error occurred while updating your preferences' });
  }
});

app.delete('/users/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authenticatedUserId = req.user?.id;
    const { password } = req.body;

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: authenticatedUserId },
      select: { password: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    await prisma.user.delete({ where: { id: authenticatedUserId } });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'An error occurred while deleting your account' });
  }
});

app.post('/watchlist', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tmdbId, type, status } = req.body;

    if (!isPositiveInteger(tmdbId) || !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        error: `tmdbId must be a positive integer and type must be one of: ${ALLOWED_TYPES.join(', ')}`,
      });
    }

    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }

    const authenticatedUserId = req.user?.id;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // userId always comes from the verified token, never from the request
    // body — otherwise a client could create items under someone else's account.
    const newItem = await prisma.watchlistItem.create({
      data: {
        userId: authenticatedUserId,
        tmdbId,
        type,
        status: status || 'pending',
      },
    });

    return res.status(201).json(newItem);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'This title is already in your watchlist' });
    }

    console.error(error);
    return res.status(500).json({ error: 'An error occurred while adding the item to the list' });
  }
});

app.get('/watchlist', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authenticatedUserId = req.user?.id;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const language = await getUserLanguage(authenticatedUserId);

    if (!language) {
      return res.status(404).json({ error: 'User not found' });
    }

    const watchlist = await prisma.watchlistItem.findMany({
      where: { userId: authenticatedUserId },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch TMDb details for every item in parallel. allSettled (rather than
    // Promise.all) makes sure one failed lookup doesn't take down the whole
    // response — that item just comes back with title/poster as null.
    const settledDetails = await Promise.allSettled(
      watchlist.map(item => getTitleDetails(item.tmdbId, item.type as 'movie' | 'tv', language))
    );

    const enrichedWatchlist = watchlist.map((item, index) => {
      const result = settledDetails[index];

      if (!result) {
        return { ...item, title: null, poster: null };
      }

      const details = result.status === 'fulfilled' ? result.value : null;

      return {
        ...item,
        title: details?.title ?? null,
        poster: details?.poster ?? null,
      };
    });

    return res.status(200).json(enrichedWatchlist);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'An error occurred while fetching the watchlist' });
  }
});

app.patch('/watchlist/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rating, note } = req.body;
    const authenticatedUserId = req.user?.id;

    const numericId = Number(id);
    if (!isPositiveInteger(numericId)) {
      return res.status(400).json({ error: 'ID must be a valid number' });
    }

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }

    if (rating !== undefined && rating !== null && (!isPositiveInteger(rating) && rating !== 0 || rating > 10)) {
      return res.status(400).json({ error: 'Rating must be an integer between 0 and 10' });
    }

    const existingItem = await prisma.watchlistItem.findUnique({ where: { id: numericId } });

    if (!existingItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    // Ownership check: a user can only modify their own items. 403 (not 404)
    // tells the client the item exists but isn't theirs.
    if (existingItem.userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'You do not have permission to modify this item' });
    }

    const updatedItem = await prisma.watchlistItem.update({
      where: { id: numericId },
      data: {
        status: status !== undefined ? status : existingItem.status,
        rating: rating !== undefined ? rating : existingItem.rating,
        note: note !== undefined ? note : existingItem.note,
      },
    });

    return res.status(200).json(updatedItem);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'An error occurred while updating the item' });
  }
});

app.delete('/watchlist/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const authenticatedUserId = req.user?.id;

    const numericId = Number(id);
    if (!isPositiveInteger(numericId)) {
      return res.status(400).json({ error: 'ID must be a valid number' });
    }

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const existingItem = await prisma.watchlistItem.findUnique({ where: { id: numericId } });

    if (!existingItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }

    if (existingItem.userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'You do not have permission to delete this item' });
    }

    await prisma.watchlistItem.delete({ where: { id: numericId } });

    return res.status(200).json({ message: 'Item successfully removed from your watchlist' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'An error occurred while deleting the item' });
  }
});

app.get('/search', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, lang } = req.query;
    const authenticatedUserId = req.user?.id;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'The "query" parameter is required and must be a string' });
    }

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (lang !== undefined && (typeof lang !== 'string' || !isTmdbLanguage(lang))) {
      return res.status(400).json({ error: `lang must be one of: ${ALLOWED_LANGUAGES.join(', ')}` });
    }

    const userLanguage = await getUserLanguage(authenticatedUserId);

    if (!userLanguage) {
      return res.status(404).json({ error: 'User not found' });
    }

    const language = (lang && isTmdbLanguage(lang) ? lang : userLanguage);
    const results = await searchTMDb(query, language);
    return res.status(200).json(results);
  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    return res.status(500).json({ error: 'An error occurred while searching TMDb' });
  }
});

app.get('/protected', authenticateJWT, (_req, res) => {
  res.json({ message: 'If you can see this, your token is valid' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
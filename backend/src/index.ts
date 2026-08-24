import 'dotenv/config';
import express, { Request, Response } from 'express';
import { PrismaClient } from './generated/prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateJWT, getJwtSecret, AuthenticatedRequest } from './middleware/auth';
import { searchTMDb, getTitleDetails } from './services/tmdb';

const app = express();
const PORT = 3000;
const prisma = new PrismaClient();

// Allowed values for watchlist item fields. Validating against these lists
// (instead of trusting any string) keeps the stored data consistent and
// prevents garbage values from reaching TMDb requests downstream.
const ALLOWED_TYPES = ['movie', 'tv'] as const;
const ALLOWED_STATUSES = ['pending', 'watching', 'watched'] as const;

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('hello world');
});

app.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const newUser = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        name,
      },
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while creating the user' });
  }
});

app.post('/auth/login', async (req: Request, res: Response) => {
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

app.post('/watchlist', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tmdbId, type, status } = req.body;

    if (!tmdbId || isNaN(Number(tmdbId)) || !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        error: `tmdbId must be a valid number and type must be one of: ${ALLOWED_TYPES.join(', ')}`,
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
        tmdbId: Number(tmdbId),
        type,
        status: status || 'pending',
      },
    });

    return res.status(201).json(newItem);
  } catch (error) {
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

    const watchlist = await prisma.watchlistItem.findMany({
      where: { userId: authenticatedUserId },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch TMDb details for every item in parallel. allSettled (rather than
    // Promise.all) makes sure one failed lookup doesn't take down the whole
    // response — that item just comes back with title/poster as null.
    const settledDetails = await Promise.allSettled(
      watchlist.map(item => getTitleDetails(item.tmdbId, item.type as 'movie' | 'tv'))
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
    if (isNaN(numericId)) {
      return res.status(400).json({ error: 'ID must be a valid number' });
    }

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }

    if (rating !== undefined && rating !== null && isNaN(Number(rating))) {
      return res.status(400).json({ error: 'Rating must be a valid number' });
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
        rating: rating !== undefined ? (rating !== null ? Number(rating) : null) : existingItem.rating,
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
    if (isNaN(numericId)) {
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

app.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'The "query" parameter is required and must be a string' });
    }

    const results = await searchTMDb(query);
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
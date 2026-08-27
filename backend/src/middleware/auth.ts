import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

function isValidJwtPayload(payload: object): payload is { id: number; email: string } {
  const candidate = payload as { id?: unknown; email?: unknown };
  return (
    typeof candidate.id === 'number' &&
    Number.isInteger(candidate.id) &&
    candidate.id > 0 &&
    typeof candidate.email === 'string'
  );
}

// Reads JWT_SECRET in one place, so every route that needs it (this
// middleware, and the login route that signs new tokens) fails the same
// way if it's missing, instead of duplicating the same check everywhere.
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in the environment');
  }
  return secret;
}

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  let jwtSecret: string;
  try {
    jwtSecret = getJwtSecret();
  } catch {
    console.error('CRITICAL ERROR: JWT_SECRET is not defined in .env');
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    // Explicitly whitelisting the algorithm is a defensive habit: it stops
    // a token from being accepted if it was signed with an algorithm other
    // than the one this server actually uses.
    const decodedPayload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });

    if (typeof decodedPayload === 'string') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (!isValidJwtPayload(decodedPayload)) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = {
      id: decodedPayload.id,
      email: decodedPayload.email,
    };

    next();
  } catch (error) {
    console.error('[AUTH MIDDLEWARE ERROR]', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
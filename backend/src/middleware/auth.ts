import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface RequestConUsuario extends Request {
  usuario?: {
    id: number;
    email: string;
  };
}

export const validarJWT = (req: RequestConUsuario, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
}

  try {
    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
      console.error("CRITICAL ERROR: JWT_SECRET no definido en el .env");
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    const payloadDecodificado = jwt.verify(token, secreto, {});

    if (typeof payloadDecodificado === 'string') {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    req.usuario = {
      id: payloadDecodificado.id,
      email: payloadDecodificado.email,
    };

    next();

  } catch (error) {
    console.error('[MIDDLEWARE AUTH ERROR]', error);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

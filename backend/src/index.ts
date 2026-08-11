import 'dotenv/config';
import express, { Request, Response } from 'express';
import { PrismaClient } from './generated/prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { validarJWT, RequestConUsuario } from './middleware/auth';

const app = express();
const PORT = 3000;
const prisma = new PrismaClient();

app.use(express.json());


app.get('/', (_req: Request, res: Response) => {
  res.send('hola mundo');
});

app.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    const nuevoUsuario = await prisma.user.create({
      data: {
        email: email,
        password: await bcrypt.hash(password, 10),
        name: name,
      },
    });
    
    res.status(201).json(nuevoUsuario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Hubo un error al crear el usuario' });
  }
});

app.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const usuario = await prisma.user.findUnique({
      where: { email: email },
    });
    
    if (!usuario) {
      console.error(`[LOGIN FALLIDO] Email no encontrado: ${email}`);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const isMatch = await bcrypt.compare(password, usuario.password);
    
    if (!isMatch) {
      console.error(`[LOGIN FALLIDO] Password incorrecta para: ${email}`);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const payload = {
      id: usuario.id,
      email: usuario.email
    };
    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
      console.error("CRITICAL ERROR: JWT_SECRET no está definido en el archivo .env");
      return res.status(500).json({ error: "Error interno del servidor" });
    }
    
    const token = jwt.sign(payload, secreto, { expiresIn: '1h' });
    
    return res.status(200).json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Hubo un error al iniciar sesión' });
  }
});

app.post('/watchlist', validarJWT, async (req: RequestConUsuario, res: Response) => {
  try {
    const { tmdbId, tipo, estado, puntuacion, nota } = req.body;

    if (!tmdbId || isNaN(Number(tmdbId)) || !tipo) {
      return res.status(400).json({ error: 'tmdbId debe ser un número válido y tipo es obligatorio' });
    }

    const userIdAutenticado = req.usuario?.id;

    if (!userIdAutenticado) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const nuevoItem = await prisma.watchlistItem.create({
      data: {
        userId: userIdAutenticado,
        tmdbId: Number(tmdbId),
        tipo: tipo,
        estado: estado || 'pendiente',
        puntuacion: puntuacion ? Number(puntuacion) : null,
        nota: nota || null,
      },
    });

    return res.status(201).json(nuevoItem);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Hubo un error al agregar el ítem a la lista' });
  }
});

app.get('/watchlist', validarJWT, async (req: RequestConUsuario, res: Response) => {
  try {
    const userIdAutenticado = req.usuario?.id;

    if (!userIdAutenticado) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const watchlist = await prisma.watchlistItem.findMany({
      where: {
        userId: userIdAutenticado,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json(watchlist);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Hubo un error al obtener la watchlist' });
  }
});

app.put('/watchlist/:id', validarJWT, async (req: RequestConUsuario, res: Response) => {
  try {
    const { id } = req.params;
    const { estado, puntuacion, nota } = req.body;
    const userIdAutenticado = req.usuario?.id;

    if (!userIdAutenticado) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (puntuacion !== undefined && puntuacion !== null && isNaN(Number(puntuacion))) {
      return res.status(400).json({ error: 'La puntuación debe ser un número válido' });
    }

    const itemExistente = await prisma.watchlistItem.findUnique({
      where: { id: Number(id) }
    });

    if (!itemExistente) {
      return res.status(404).json({ error: 'El ítem de la watchlist no existe' });
    }

    if (itemExistente.userId !== userIdAutenticado) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este ítem' });
    }

    const itemActualizado = await prisma.watchlistItem.update({
      where: { id: Number(id) },
      data: {
        estado: estado !== undefined ? estado : itemExistente.estado,
        puntuacion: puntuacion !== undefined ? (puntuacion ? Number(puntuacion) : null) : itemExistente.puntuacion,
        nota: nota !== undefined ? nota : itemExistente.nota,
      },
    });

    return res.status(200).json(itemActualizado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Hubo un error al actualizar el ítem' });
  }
});

app.delete('/watchlist/:id', validarJWT, async (req: RequestConUsuario, res: Response) => {
  try {
    const { id } = req.params;
    const userIdAutenticado = req.usuario?.id;

    if (!userIdAutenticado) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const itemExistente = await prisma.watchlistItem.findUnique({
      where: { id: Number(id) }
    });

    if (!itemExistente) {
      return res.status(404).json({ error: 'El ítem de la watchlist no existe' });
    }

    if (itemExistente.userId !== userIdAutenticado) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este ítem' });
    }

    await prisma.watchlistItem.delete({
      where: { id: Number(id) }
    });

    return res.status(200).json({ message: 'Ítem eliminado correctamente de tu watchlist' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Hubo un error al eliminar el ítem' });
  }
});



app.get('/protegido', validarJWT, (req, res) => {
  res.json({ message: 'Si ves esto, tu token es válido' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
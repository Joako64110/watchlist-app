import 'dotenv/config';
import express, { Request, Response } from 'express';
import { PrismaClient } from './generated/prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { validarJWT } from './middleware/auth';

const app = express();
const PORT = 3000;
const prisma = new PrismaClient();

app.use(express.json());

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

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

app.get('/protegido', validarJWT, (req, res) => {
  res.json({ message: 'Si ves esto, tu token es válido' });
});
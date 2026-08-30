# Watchlist App

A full-stack watchlist application for tracking movies and TV shows, built with a TypeScript/Express backend and integrated with [The Movie Database (TMDb)](https://www.themoviedb.org/) for search and title data.

> **Status:** Backend complete. Frontend in progress.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Validation & Constraints](#validation--constraints)
- [Security](#security)
- [Future Improvements](#future-improvements)

## Features

- **Authentication** — JWT-based auth with bcrypt-hashed passwords
- **Watchlist CRUD** — add, list, update, and remove movies/TV shows from a personal list
- **Ownership-based authorization** — users can only view or modify their own items
- **TMDb integration** — search titles and enrich watchlist entries with posters and titles
- **Per-user language preference** — title data is returned in the user's preferred language (5 supported languages)
- **Account management** — update language preference, delete account (with password re-confirmation and cascading cleanup)
- **Hardened by design** — rate limiting, strict input validation, security headers, and data-integrity constraints enforced at the database level

## Tech Stack

| Layer          | Technology                          |
|----------------|--------------------------------------|
| Backend        | Node.js, Express, TypeScript        |
| Database       | PostgreSQL (via Docker), Prisma ORM |
| Auth           | JWT (jsonwebtoken), bcrypt          |
| External API   | TMDb (Axios client)                 |
| Security       | helmet, cors, express-rate-limit    |
| Frontend (WIP) | React, Vite, TypeScript             |

## Project Structure

watchlist-app/
├── backend/
│ ├── src/
│ │ ├── index.ts # Express app and route handlers
│ │ ├── middleware/auth.ts # JWT verification middleware
│ │ └── services/tmdb.ts # TMDb API client
│ ├── prisma/
│ │ ├── schema.prisma # Database schema
│ │ └── migrations/
│ └── package.json
└── frontend/ # Coming soon

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Docker](https://www.docker.com/) (for running PostgreSQL)
- A [TMDb account](https://www.themoviedb.org/settings/api) for an API Read Access Token

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Joako64110/watchlist-app.git
cd watchlist-app/backend

# 2. Install dependencies
npm install

# 3. Start a PostgreSQL container
docker run --name watchlist-postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=watchlist_db \
  -p 5432:5432 \
  -d postgres

# 4. Create a .env file (see Environment Variables below)

# 5. Run database migrations
npx prisma migrate dev

# 6. Start the development server
npm run dev
```

The API will be available at `http://localhost:3000`.

## Environment Variables

Create a `.env` file inside `backend/` with the following:

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/watchlist_db"
JWT_SECRET="a-long-random-secret"
TMDB_READ_ACCESS_TOKEN="your-tmdb-read-access-token"
FRONTEND_URL="http://localhost:5173"
```

## API Reference

All protected routes require an `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint          | Auth | Description                          |
|--------|-------------------|------|---------------------------------------|
| POST   | `/auth/register`  | No   | Create a new account                  |
| POST   | `/auth/login`      | No   | Log in and receive a JWT              |

Both routes are rate-limited to **5 attempts per 15 minutes per IP address** (shared between the two).

<details>
<summary>Example: Register</summary>

**Request**
```json
POST /auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "Jane Doe"
}
```

**Response** `201 Created`
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "Jane Doe",
  "language": "en-US",
  "createdAt": "2026-08-27T12:00:00.000Z"
}
```
</details>

### Users

| Method | Endpoint     | Auth | Description                                             |
|--------|--------------|------|-----------------------------------------------------------|
| PATCH  | `/users/me`  | Yes  | Update the current user's language preference             |
| DELETE | `/users/me`  | Yes  | Delete the account (requires password, returns `204`)     |

**Supported languages:** `es-ES`, `en-US`, `pt-BR`, `fr-FR`, `de-DE`

### Watchlist

| Method | Endpoint             | Auth | Description                                    |
|--------|-----------------------|------|--------------------------------------------------|
| POST   | `/watchlist`          | Yes  | Add a title to the watchlist                     |
| GET    | `/watchlist`          | Yes  | List the user's watchlist, enriched with TMDb data |
| PATCH  | `/watchlist/:id`      | Yes  | Update status, rating, or note                   |
| DELETE | `/watchlist/:id`      | Yes  | Remove an item                                   |

<details>
<summary>Example: Add an item</summary>

**Request**
```json
POST /watchlist
{
  "tmdbId": 550,
  "type": "movie",
  "status": "pending"
}
```

**Response** `201 Created`
```json
{
  "id": 1,
  "userId": 1,
  "tmdbId": 550,
  "type": "movie",
  "status": "pending",
  "rating": null,
  "note": null,
  "createdAt": "2026-08-27T12:00:00.000Z"
}
```
</details>

### Search

| Method | Endpoint  | Auth | Description                                          |
|--------|-----------|------|--------------------------------------------------------|
| GET    | `/search` | Yes  | Search TMDb for movies/TV shows (`?query=` required, `?lang=` optional override) |

Requires auth intentionally — it ties TMDb usage to registered users and lets the response default to the user's saved language.

## Validation & Constraints

- **Email:** basic format check (not RFC-perfect — real verification would require a confirmation email flow)
- **Password:** minimum 8 characters
- **`type`:** must be `movie` or `tv`
- **`status`:** must be `pending`, `watching`, or `watched`
- **`rating`:** integer between `0` and `10` (or `null`)
- **Watchlist duplicates:** a user cannot add the same title (same `tmdbId` + `type`) twice — enforced at the database level
- **IDs:** must be positive integers; non-numeric or negative values are rejected before hitting the database

## Security

This project treats security as a first-class concern, not an afterthought:

- Passwords are hashed with **bcrypt** — never stored or returned in plain text
- JWTs are signed and verified with an explicit **algorithm allowlist** to prevent algorithm-confusion attacks
- Decoded JWT payloads are validated for shape before being trusted
- Every watchlist mutation includes an **ownership check** (`403`, not `404`, when the item exists but isn't the requester's)
- **Rate limiting** on authentication endpoints (5 requests / 15 min / IP) to slow down brute-force attempts
- Strict **input validation** on every endpoint — no implicit type coercion for IDs, ratings, or enums
- **Unique constraints** and **enums** at the database level prevent invalid or duplicate data, even if application-level validation is ever bypassed
- Account deletion requires **password re-confirmation**, even with a valid session token, and **cascades** to remove the user's watchlist items
- **CORS**, **helmet**, and a **request body size limit** reduce the app's attack surface

## Future Improvements

- [ ] Password recovery flow (email-based reset)
- [ ] Automated tests (Jest + Supertest)
- [ ] Frontend (React + Vite)
- [ ] Deployment (Render/Railway + Vercel)
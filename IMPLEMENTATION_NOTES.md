# Railway ETA integration / authentication update

## What was fixed

- Login is now backed by the MongoDB `users` collection instead of a hard-coded frontend/backend user list.
- Passwords are stored as bcrypt hashes.
- JWT contains the user ID and role.
- `/api/auth/me` validates the current session against MongoDB.
- Public registration creates `PASSENGER` accounts only. Privileged operational roles are provisioned separately.
- Operational API routes are protected with JWT and role middleware.
- Frontend validates the saved JWT on reload before rendering any dashboard.
- Dashboard rendering is mapped strictly from the authenticated backend role.
- Added `/api/trains/:trainNumber/forecast` for upcoming station ETA forecasts.
- Prediction fallback now uses live delay + historical training data + recent trend + contention when the optional ML service is unavailable.
- Existing `backend/data` files are not copied into MongoDB by the application at startup.
- Existing scripts remain available for importing/seeding data.

## First-time setup

1. Keep your own `backend/.env` locally. Use `backend/.env.example` as the template.
2. Install backend dependencies:
   `cd backend && npm install`
3. Provision the four demo users:
   `npm run seed:users`
4. Start backend:
   `npm run dev`
5. Start frontend:
   `cd frontend && npm install && npm run dev`

The four provisioned demo accounts use the password `password123`:
- passenger@railway.in
- station@railway.in
- control@railway.in
- feeder@railway.in

Change these credentials before any real deployment.

## Important security note

The original uploaded archive contained MongoDB credentials inside `backend/.env`. The patched archive intentionally excludes that file. Rotate the MongoDB password/credentials before using the repository outside your local environment.

## Main protected API contract

- `POST /api/auth/register` — public passenger registration
- `POST /api/auth/login` — login
- `GET /api/auth/me` — authenticated session validation
- `GET /api/trains/running` — authenticated users
- `GET /api/trains/:trainNumber/live` — authenticated users
- `GET /api/trains/:trainNumber/predict` — authenticated users
- `GET /api/trains/:trainNumber/forecast` — authenticated users
- `GET /api/stations/:code/arrivals` — station staff/control room
- `GET /api/cascade/:trainNumber` — control room
- `POST /api/control/inject-delay` — control room
- `POST /api/station/assign-platform` — station staff/control room
- `POST /api/station/announcement` — station staff/control room
- `GET /api/feeder` — feeder manager/control room
- `POST /api/feeder/:trainNumber/sync` — feeder manager/control room

## Architecture

Browser -> Axios API client -> Express/JWT middleware -> role-protected route -> MongoDB -> prediction service -> frontend dashboard.

The optional ML service remains supported through `ML_SERVICE_URL`. If it is unavailable, the backend still produces a statistical ETA using the MongoDB training/operational history rather than failing the passenger dashboard.

# FitTrack Pro — Gym & Nutrition Tracking Web App

FitTrack Pro is a full-stack fitness web app with:

- Secure email/password authentication (signup/login)
- User onboarding (body metrics, goals, activity, diet preference)
- Dynamic 7-day Indian vegetarian high-protein meal plans
- Meal completion/skipping + meal image upload with nutrition estimation
- Dashboard with calories/protein summary, streaks, water intake, weight progression charts
- Goal-based workout plans (fat loss, muscle gain, maintenance)
- Progress photos upload
- Admin dashboard to view all users and key profile stats

## Tech Stack

- **Frontend:** HTML/CSS/Vanilla JS (SPA-style) + Chart.js
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **Auth:** JWT + bcrypt password hashing

## Quick Start

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Demo Admin

- Email: `admin@fittrack.dev`
- Password: `Admin@12345`

## API Highlights

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET/PUT /api/profile`
- `GET /api/meal-plan`
- `POST /api/meal-action`
- `POST /api/upload-meal`
- `GET /api/dashboard`
- `GET /api/workout`
- `GET /api/reminders`
- `GET /api/admin/users` (admin only)

## Notes

- Uploaded files are stored in `/uploads`
- SQLite database file is `fitness.db`
- For production, set a strong `JWT_SECRET`

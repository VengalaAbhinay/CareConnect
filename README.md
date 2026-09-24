# CareConnect — Home Services Booking & Operations Platform

MERN stack (MongoDB, Express, React/Vite, Node.js) — AI-enabled capstone.
A full marketplace where customers request home services, providers quote and
complete jobs, and admins/ops/support run the platform: categories, provider
verification, disputes, analytics, notifications, and an audit trail.

## 1. Project structure

```
CareConnect/
├── backend/
│   ├── API/                UserAPI, ProviderAPI, ServiceAPI, BookingAPI, AdminAPI, NotificationAPI
│   ├── config/              db.js (optional standalone Mongo connector)
│   ├── middlewares/          auth.js (JWT verify + role guard)
│   ├── Models/                User, ProviderProfile, ServiceCategory, ServiceRequest,
│   │                          Quote, Booking, Review, Dispute, Notification, AuditLog
│   ├── services/               aiService.js (classification + provider ranking),
│   │                            activityService.js (notify + audit log helpers)
│   ├── seed.js                 creates admin/ops/support accounts + starter categories
│   ├── .env.example
│   └── server.js
└── frontend/
    ├── src/
    │   ├── api/axiosInstance.js
    │   ├── components/
    │   │   ├── Login.jsx, Register.jsx, AuthLayout.jsx, ProtectedRoute.jsx
    │   │   └── shared/        AppShell, NotificationBell, BookingDetail, UI (Badge, Modal, Tabs…)
    │   ├── pages/               Dashboard (role router), CustomerDashboard,
    │   │                        ProviderDashboard, AdminDashboard
    │   ├── store/                authStore, serviceStore, bookingStore, providerStore,
    │   │                          adminStore, notificationStore  (all Zustand)
    │   ├── styles/index.css
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── .env.example
```

## 2. What's implemented (against the spec)

| Role | What they can do end-to-end |
|---|---|
| **Customer** | Create a service request (with an AI "suggest category" preview), browse quotes, accept a quote → schedule a booking, track job timeline, confirm completion, leave a rating/review, raise a dispute, see notifications. |
| **Provider** | Build a profile (skills, service areas, experience, verification documents), set weekly availability, browse/search open requests, submit quotes, track quote status, manage active jobs (advance status, attach before/after evidence URLs), see notifications. |
| **Admin** | CRUD service categories, verify/reject providers, manage users (role + active status), oversee all bookings, resolve disputes (status + refund + notes), view platform analytics, view the audit trail. |
| **Operations Manager** | Verify providers, view users, oversee bookings, resolve disputes, view analytics + audit trail. |
| **Support Agent** | View and resolve disputes, view bookings. |

Also implemented platform-wide: JWT auth (httpOnly cookie) + role-based access
control on every route, an availability-overlap check when booking, search/filter
on requests/providers/users/bookings/disputes, in-app notifications on every key
event (quote received, booking created/updated, review received, dispute
raised/resolved, provider verified), and an audit log of every admin/ops action.

## 3. AI integration

`backend/services/aiService.js` powers two features:

1. **Request classification** — `POST /service-api/classify` maps a customer's
   free-text description to a service category + required skills.
2. **Provider ranking** — `GET /service-api/requests/:id/suggested-providers`
   scores verified providers in the request's service area by skill match,
   rating, and experience.

If `ANTHROPIC_API_KEY` is set in `backend/.env`, both call the real Claude API.
If it's left blank, a deterministic weighted heuristic (keyword/skill overlap +
rating + experience) is used instead — so the feature works fully offline too.
No frontend changes are needed either way; the response shape is identical.

## 4. Create your MongoDB database

1. Go to https://cloud.mongodb.com and create a free cluster (or use a local `mongod`).
2. **Database Access** → add a database user with a password.
3. **Network Access** → add your IP (or `0.0.0.0/0` for development only).
4. **Connect** → **Drivers** → copy the connection string, e.g.:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/careconnect?retryWrites=true&w=majority
   ```

## 5. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` — set `DB_URL` and a strong `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Seed internal-role accounts** (admin/operationsManager/supportAgent can't be
created via public registration by design — see `UserAPI.js`):
```bash
npm run seed
```
This prints login credentials for one account of each internal role, and creates
5 starter service categories so the app isn't empty on first run.

Run the backend:
```bash
npm run dev      # nodemon, auto-restarts on changes
# or
npm start
```
You should see `DB Connection Success` and `server on port 8000....`.

## 6. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```
Vite serves on `http://localhost:5173`, already whitelisted in the backend's CORS config.

## 7. Try the full workflow

1. Register a **customer** and a **provider** at `/register`.
2. Log in as the seeded **admin** → *Providers* tab → verify the provider.
3. Log in as the **provider** → *My profile* → add skills, service areas, availability.
4. Log in as the **customer** → *My requests* → new request → try "✨ Suggest category with AI" → submit.
5. Log in as the **provider** → *Open requests* → submit a quote.
6. Log in as the **customer** → *My requests* → View quotes → accept & schedule.
7. Log in as the **provider** → *My jobs* → advance status (in progress → completed) with evidence URLs.
8. Log in as the **customer** → *My bookings* → confirm completion → leave a review (or raise a dispute).
9. Log in as **admin/ops/support** → *Disputes* / *Analytics* / *Audit log* to see the oversight side.

## 8. API surface (mounted in server.js)

| Base path            | Covers |
|-----------------------|--------|
| `/user-api`            | register, login, logout, /me |
| `/provider-api`         | provider profile, availability, admin verification, search |
| `/service-api`          | categories, service requests, AI classify/match, quotes |
| `/booking-api`          | bookings, job timeline, reviews, disputes |
| `/admin-api`            | user management, analytics, audit trail |
| `/notification-api`      | in-app notifications |

## 9. Deploying

- Backend: any Node host (Render, Railway, Fly.io). Set the same env vars there,
  including `ANTHROPIC_API_KEY` if you want real AI classification/ranking in production.
- Frontend: Vercel/Netlify. Set `VITE_API_BASE_URL` to your deployed backend URL, and add
  your frontend's deployed URL to the `origin` array in `backend/server.js`'s CORS config.

## 10. Suggested next steps (beyond this capstone scope)

- Swap the plain-text evidence/document URL fields for real file uploads (Multer + S3/Cloudinary).
- Add pagination to list endpoints once data volume grows.
- Add automated tests (Jest + Supertest for backend, Vitest + Testing Library for frontend).
- Add a payments integration (Razorpay/Stripe) against `booking.invoice`.

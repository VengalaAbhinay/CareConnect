# CareConnect — updated files only

This archive contains only the files that were added or changed during the audit + rewrite.
Drop these into your existing project, overwriting the matching paths, then:

```
cd backend && npm install && npm run seed && npm run dev
cd frontend && npm install && npm run dev
```

**Not included, on purpose:**
- `backend/.env` — your original file contains a live MongoDB Atlas password and a live
  Anthropic API key. Both were present in the uploaded zip. Please **rotate both credentials**
  and keep using your own local `.env` (see the updated `.env.example` for the few new
  optional variables: `BUSINESS_TZ_OFFSET_MIN`, `SUPPORT_REFUND_LIMIT`, `UPLOAD_DIR`).
- `node_modules/`, `backend/uploads/` — generated/runtime, not source.

## What changed and why

A full empirical audit (seeded a test DB, hit every endpoint) turned up several real bugs
before any rewriting started — see the "Fixed bugs" list below. Given the scope, the backend
was substantially rewritten rather than patched, and the frontend was updated to match.

### Backend

- **Real availability engine** (`services/availabilityService.js`, `Models/SlotLockModel.js`):
  atomic slot-locking via a unique compound index, so double-booking is impossible even under
  concurrent requests — verified directly with a race-condition test (one winner, every time).
- **Pricing policy** (`services/pricingService.js`): categories can enforce a price range on
  quotes, with tax % and platform fee % configurable per category.
- **Real invoicing** (`Models/InvoiceModel.js`, `API/InvoiceAPI.js`, `services/invoiceService.js`):
  line items, tax, platform fee, provider payout, refunds — none of this existed before.
- **File uploads** (`middlewares/upload.js`, `API/UploadAPI.js`): multer-based, mimetype-checked,
  size-limited, random filenames, served at `/uploads/*`.
- **Support case system** (`API/SupportAPI.js`, upgraded `Models/DisputeModel.js`): disputes,
  complaints and refund requests with message threads, internal staff notes, assignment,
  escalation from support → operations, and refund-limit gating (`SUPPORT_REFUND_LIMIT`).
- **Booking state machine**: added `awaitingConfirmation` (customer must confirm before a job
  counts as done), reject-completion, reschedule, and staff reassignment.
- **Admin**: staff-account creation (admin/ops/support), revenue trend and top-providers
  analytics computed from real paid invoices (not just booking price).
- **AI ranking**: providers are now ranked using real same-day/next-7-day availability data and
  Bayesian-smoothed ratings, not placeholder scores.
- **Tightened authorization**: providers never see each other's quotes; a customer's exact
  address is hidden from providers until they hold the accepted quote; staff-only fields are
  stripped from non-staff API responses.

### Fixed bugs (proven via an automated test suite — 44/44 passing)

- Quotes could be submitted with absurd prices (no policy check) → now enforced per category.
- A provider could submit two live quotes on the same request → blocked.
- Bookings could be made outside a provider's declared weekly availability → blocked.
- Bookings could be made with an end time before the start time → blocked.
- Cancelling a booking didn't free the provider's slot → now released atomically.
- An already-cancelled booking could be cancelled again → blocked.
- A support agent got a 403 trying to cancel a booking on a customer's behalf → fixed.
- No invoice was ever created for a completed booking → now created automatically.
- `$year`/`$month` aggregation (used for the revenue trend) isn't supported on every
  Mongo-compatible backend (found via testing) → rewritten to bucket in plain JS, which works
  everywhere.

### Frontend

All six Zustand stores were updated to match the new API shapes; two new stores
(`invoiceStore.js`, `supportStore.js`) were added. `BookingDetail.jsx` now surfaces the full
booking lifecycle: evidence upload, invoices (draft/issue/pay), reschedule, staff reassignment,
review edit/reply, and support cases. A new shared `SupportCaseThread.jsx` component is used
both from booking details and the admin support queue. All three dashboards gained new tabs
(Invoices, Support, Staff accounts, richer Analytics) and the provider dashboard gained a real
stats overview. `Register.jsx`'s password validation now matches the backend's actual policy
(8+ characters, at least one letter and one number).

The full app was built with `vite build` after these changes and compiles cleanly.

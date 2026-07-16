# Ecommerce Backend

Node.js + Express 5 + MongoDB (Mongoose) REST API. It follows the exact same
coding flow as the CRUD app: for every resource there is a **model**, a
**route**, and a **controller**, controllers are `async` functions wrapped in
`try/catch` that talk to the Mongoose model directly and reply with
`res.status(...).json(...)`.

## How this maps to your CRUD app

| CRUD app | Here |
| --- | --- |
| `models/product.model.js` | `models/*.model.js` (same schema style + `timestamps`) |
| `routes/product.route.js` | `routes/*.route.js` (same `express.Router()` + destructured controller import) |
| `controllers/product.controller.js` | `controllers/*.controller.js` (same `async` + `try/catch` + `res.status().json()`) |
| `index.js` (connect then listen) | split into `app.js` (build the app) + `server.js` (connect DB, then listen) |
| `app.use("/api/products", productRoute)` | centralised in `routes/index.js` |

Everything new (auth middleware, config, helpers, validations) is written in the
same plain CommonJS style so it stays easy to read and change.

## Request flow

```
server.js  ->  connect DB, start HTTP + Socket.io
app.js     ->  middleware (helmet, cors, json, sanitize, rate limit) + mount routes
routes/    ->  match verb + path, run guards/validation, call controller
controllers/-> talk to the model, return JSON
models/    ->  Mongoose schema
```

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # node --watch server.js  (auto-restart)
# or
npm start                 # node server.js
```

You need MongoDB running locally (or set `MONGO_URI` to Atlas). The server
starts on `PORT` (default 3000).

## Folder structure

```
config/        env loader, db connection, cloudinary
constants/     roles, order/payment/coupon enums
middleware/    auth (JWT bearer), error handler, upload (multer), validate, rate limit, sanitize
models/        user, category, product, cart, coupon, order, wishlist
controllers/   one per resource (CRUD-app style)
routes/        one per resource + index.js aggregator
validations/   express-validator rule sets
helpers/       sendEmail (Brevo), uploadImage (Cloudinary)
utils/         generateToken (JWT), cookies, pricing
sockets/       Socket.io init (per-user rooms for notifications)
```

## Auth

- **Access token**: short-lived JWT, sent by the client as `Authorization: Bearer <token>`.
- **Refresh token**: long-lived JWT stored in an httpOnly cookie; `POST /api/auth/refresh` issues a new access token.
- **Roles**: `customer` (default), `admin`, `designer`, `printer`, `delivery`. Admin-only routes use `authorize("admin")`.

## API reference (Phase 1)

Base URL: `/api`

### Auth
```
POST   /auth/register            { name, email, password, phone? }
POST   /auth/login               { email, password }
POST   /auth/refresh             (uses refresh cookie)
POST   /auth/logout
GET    /auth/me                  (Bearer)
PUT    /auth/me                  (Bearer) { name?, phone?, avatar? }
POST   /auth/forgot-password     { email }
POST   /auth/reset-password/:token  { password }
```

### Users
```
GET    /users/me/addresses       (Bearer)
POST   /users/me/addresses       (Bearer) { line1, city, state, postalCode, ... }
DELETE /users/me/addresses/:addressId  (Bearer)
GET    /users                    (admin)
GET    /users/:id                (admin)
PUT    /users/:id/role           (admin) { role }
DELETE /users/:id                (admin)
```

### Categories
```
GET    /categories               (public)
GET    /categories/:id           (public)
POST   /categories               (admin)
PUT    /categories/:id           (admin)
DELETE /categories/:id           (admin)
```

### Products
```
GET    /products                 (public) ?keyword=&category=&minPrice=&maxPrice=&sort=&page=&limit=
GET    /products/:id             (public)
POST   /products                 (admin, multipart form-data, image field: "images")
PUT    /products/:id             (admin, multipart)
DELETE /products/:id             (admin)
```

### Cart
```
GET    /cart                     (Bearer)
POST   /cart                     (Bearer) { productId, quantity }
PUT    /cart/:productId          (Bearer) { quantity }
DELETE /cart/:productId          (Bearer)
DELETE /cart                     (Bearer) clear cart
POST   /cart/coupon              (Bearer) { code }
DELETE /cart/coupon              (Bearer)
```

### Coupons
```
GET    /coupons                  (admin)
POST   /coupons                  (admin) { code, type, value, minOrderAmount?, maxDiscount?, expiresAt?, usageLimit? }
PUT    /coupons/:id              (admin)
DELETE /coupons/:id              (admin)
```

### Orders
```
POST   /orders                   (Bearer) { shippingAddress, paymentMethod }
GET    /orders/my                (Bearer)
GET    /orders/:id               (Bearer, owner or admin)
GET    /orders                   (admin)
PUT    /orders/:id/status        (admin) { status }
PUT    /orders/:id/cancel        (Bearer, owner)
```

### Wishlist
```
GET    /wishlist                 (Bearer)
POST   /wishlist                 (Bearer) { productId }
DELETE /wishlist/:productId      (Bearer)
```

## Notes on the Express 5 stack

- `xss-clean` and `hpp` are installed but **not wired in**: both reassign
  `req.query`, which is read-only in Express 5 and crashes on the first request.
  `middleware/sanitize.middleware.js` covers NoSQL injection safely instead.
- All prices (subtotal, discount, GST, shipping, total) are computed on the
  server in `utils/pricing.js` — the client never dictates what it pays.

## What is NOT built yet (later phases from the roadmap)

These packages/folders are ready for when you get to them:

- **Payments (Razorpay)** — order currently supports `cod`; `paymentInfo` and
  `paymentStatus` fields already exist on the order. Add `services/payment` +
  `POST /payment/create` and `POST /payment/webhook`. (Razorpay isn't in
  `package.json` yet — `npm i razorpay`.)
- **Design module** (canvas JSON, fonts, layers) — the heart of a Vistaprint-style app.
- **Shipping, Reviews, Notifications, Admin analytics.**
- **Redis** — caching, sessions, OTP, rate-limit store (`npm i ioredis`).
- **BullMQ jobs** (`jobs/`) — email, PDF invoices, thumbnails (`npm i bullmq`).
- **PDFKit + Sharp** — invoice generation and image processing.
- Empty folders `services/ repositories/ jobs/ cron/ templates/ docs/ logs/ database/`
  are kept as placeholders for these phases.

Every new resource follows the same three-file pattern, so adding one is:
create `x.model.js`, `x.controller.js`, `x.route.js`, then add one line to
`routes/index.js`.

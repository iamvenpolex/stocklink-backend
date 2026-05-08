import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import sellerRoutes from "./routes/seller.routes.js";
import adminRoutes from "./routes/admin.routes.js";



// ✅ Only load .env file locally — Render sets env vars via its dashboard
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://stocklink-admin.vercel.app",
      process.env.FRONTEND_URL, // set this in Render environment variables
    ].filter(Boolean),
    credentials: true,
  })
);

// ✅ Increased limit to support base64 image uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("StockLINK API running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🔥 Server running on http://localhost:${PORT}`);
});
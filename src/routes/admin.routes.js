import express from "express";
import {
  adminLogin,
  adminMe,
  getStats,
  getAllSellers,
  deleteSeller,
  getAllProducts,
  toggleSponsor,
  adminDeleteProduct,
  sendNotification,
  getNotifications,
} from "../controllers/admin.controller.js";
import { protect } from "../middleware/protect.js";

const router = express.Router();

// ── Public ───────────────────────────────────────────────────────────────────
router.post("/login", adminLogin);

// ── Protected (admin token required) ─────────────────────────────────────────
router.get("/me", protect, adminMe);
router.get("/stats", protect, getStats);

router.get("/sellers", protect, getAllSellers);
router.delete("/sellers/:id", protect, deleteSeller);

router.get("/products", protect, getAllProducts);
router.patch("/products/:id/sponsor", protect, toggleSponsor);
router.delete("/products/:id", protect, adminDeleteProduct);

router.post("/notifications", protect, sendNotification);
router.get("/notifications", protect, getNotifications);

export default router;
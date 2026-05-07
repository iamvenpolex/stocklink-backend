import express from "express";
import {
  register,
  login,
  getMe,
  updateProfile,
  updatePassword,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/protect.js";

const router = express.Router();

// ── Public routes ────────────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", login);

// ── Protected routes ─────────────────────────────────────────────────────────
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile);   // update name, business, phone
router.patch("/password", protect, updatePassword); // change password

export default router;
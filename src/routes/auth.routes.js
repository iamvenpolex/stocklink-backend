import express from "express";
import { register, login, getMe } from "../controllers/auth.controller.js";
import { protect } from "../middleware/protect.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected — dashboard uses this to verify session and load user data
router.get("/me", protect, getMe);

export default router;
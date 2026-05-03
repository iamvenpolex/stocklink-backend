import express from "express";
import {
  getAllProducts,
   getProductById,
  createProduct,
  getMyProducts,
  deleteProduct,
} from "../controllers/product.controller.js";
import { protect } from "../middleware/protect.js";

const router = express.Router();

// ── Public routes (no auth needed) ──────────────────────────────────────────
router.get("/all", getAllProducts); // marketplace — all products, promoted first
router.get("/:id", getProductById);

// ── Protected routes (seller must be logged in) ──────────────────────────────
router.post("/", protect, createProduct);     // add product
router.get("/", protect, getMyProducts);      // seller's own products
router.delete("/:id", protect, deleteProduct); // delete own product

export default router;
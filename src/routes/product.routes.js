import express from "express";
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  getMyProducts,
  deleteProduct,
} from "../controllers/product.controller.js";
import { protect } from "../middleware/protect.js";

const router = express.Router();

// ── Public routes (no auth needed) ──────────────────────────────────────────
router.get("/all", getAllProducts);    // marketplace — all products
router.get("/:id", getProductById);   // single product detail

// ── Protected routes (seller must be logged in) ──────────────────────────────
router.post("/", protect, createProduct);          // add product
router.patch("/:id", protect, updateProduct);      // edit product
router.get("/", protect, getMyProducts);           // seller's own products
router.delete("/:id", protect, deleteProduct);     // delete product

export default router;
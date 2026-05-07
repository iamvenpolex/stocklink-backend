import express from "express";
import { getSellerProfile } from "../controllers/seller.controller.js";

const router = express.Router();
router.get("/:id", getSellerProfile);
export default router;
import supabase from "../config/supabase.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in .env");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidSAPhone = (phone) =>
  /^(\+27|0)[6-8][0-9]{8}$/.test(phone?.replace(/\s/g, "") ?? "");

// ─── REGISTER ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { name, email, phone, business, password }
 *
 * 1. Validates inputs
 * 2. Creates user in Supabase Auth
 * 3. Inserts extra profile data into `sellers` table
 * 4. Returns JWT
 */
export const register = async (req, res) => {
  try {
    const { name, email, phone, business, password } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!name?.trim())
      return res.status(400).json({ message: "Full name is required." });

    if (!isValidEmail(email))
      return res.status(400).json({ message: "Invalid email address." });

    if (!isValidSAPhone(phone))
      return res
        .status(400)
        .json({ message: "Invalid South African phone number." });

    if (!business?.trim())
      return res.status(400).json({ message: "Business name is required." });

    if (!password || password.length < 6)
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters." });

    if (!/\d/.test(password) || !/[a-zA-Z]/.test(password))
      return res
        .status(400)
        .json({ message: "Password must contain a letter and a number." });

    // ── Create Supabase Auth user ────────────────────────────────────────────
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true, // set to true to require email verification
        user_metadata: { name: name.trim(), business: business.trim() },
      });

    if (authError) {
      // Supabase returns "User already registered" for duplicates
      if (authError.message.toLowerCase().includes("already")) {
        return res
          .status(409)
          .json({ message: "An account with this email already exists." });
      }
      throw authError;
    }

    const userId = authData.user.id;

    // ── Insert seller profile into `sellers` table ───────────────────────────
    // Make sure you have this table in Supabase:
    // CREATE TABLE sellers (
    //   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    //   name TEXT NOT NULL,
    //   email TEXT NOT NULL UNIQUE,
    //   phone TEXT,
    //   business TEXT,
    //   created_at TIMESTAMPTZ DEFAULT NOW()
    // );
    const { error: dbError } = await supabase.from("sellers").insert({
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone,
      business: business.trim(),
    });

    if (dbError) {
      // Roll back the auth user if DB insert fails
      await supabase.auth.admin.deleteUser(userId);
      throw dbError;
    }

    // ── Sign JWT ─────────────────────────────────────────────────────────────
    const token = signToken({
      sub: userId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      business: business.trim(),
    });

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        business: business.trim(),
        phone,
      },
    });
  } catch (err) {
    console.error("[REGISTER ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── LOGIN ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * 1. Validates inputs
 * 2. Signs in via Supabase Auth
 * 3. Fetches seller profile from `sellers` table
 * 4. Returns JWT + user profile
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!isValidEmail(email))
      return res.status(400).json({ message: "Invalid email address." });

    if (!password)
      return res.status(400).json({ message: "Password is required." });

    // ── Authenticate with Supabase ───────────────────────────────────────────
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (authError) {
      // Don't leak whether the email exists — generic message
      return res
        .status(401)
        .json({ message: "Incorrect email or password." });
    }

    const userId = authData.user.id;

    // ── Fetch seller profile ─────────────────────────────────────────────────
    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .select("id, name, email, phone, business, created_at")
      .eq("id", userId)
      .single();

    if (sellerError || !seller) {
      return res.status(404).json({ message: "Seller profile not found." });
    }

    // ── Sign JWT ─────────────────────────────────────────────────────────────
    const token = signToken({
      sub: seller.id,
      email: seller.email,
      name: seller.name,
      business: seller.business,
    });

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: seller,
    });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── GET CURRENT USER (protected) ────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 *
 * Returns the logged-in seller's profile — used by the dashboard
 */
export const getMe = async (req, res) => {
  try {
    // req.user is attached by the protect middleware
    const { data: seller, error } = await supabase
      .from("sellers")
      .select("id, name, email, phone, business, created_at")
      .eq("id", req.user.sub)
      .single();

    if (error || !seller) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({ user: seller });
  } catch (err) {
    console.error("[GET ME ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};
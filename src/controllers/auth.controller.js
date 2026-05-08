import supabase from "../config/supabase.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) throw new Error("Missing JWT_SECRET in .env");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidSAPhone = (phone) =>
  /^(\+27|0)[6-8][0-9]{8}$/.test(phone?.replace(/\s/g, "") ?? "");

// ─── REGISTER ─────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { name, email, phone, business, password } = req.body;

    if (!name?.trim())
      return res.status(400).json({ message: "Full name is required." });
    if (!isValidEmail(email))
      return res.status(400).json({ message: "Invalid email address." });
    if (!isValidSAPhone(phone))
      return res.status(400).json({ message: "Invalid South African phone number." });
    if (!business?.trim())
      return res.status(400).json({ message: "Business name is required." });
    if (!password || password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    if (!/\d/.test(password) || !/[a-zA-Z]/.test(password))
      return res.status(400).json({ message: "Password must contain a letter and a number." });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim(), business: business.trim() },
    });

    if (authError) {
      if (authError.message.toLowerCase().includes("already"))
        return res.status(409).json({ message: "An account with this email already exists." });
      throw authError;
    }

    const userId = authData.user.id;

    const { error: dbError } = await supabase.from("sellers").insert({
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone,
      business: business.trim(),
    });

    if (dbError) {
      await supabase.auth.admin.deleteUser(userId);
      throw dbError;
    }

    const token = signToken({
      sub: userId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      business: business.trim(),
    });

    return res.status(201).json({
      message: "Account created successfully.",
      token,
      user: { id: userId, name: name.trim(), email: email.trim().toLowerCase(), business: business.trim(), phone },
    });
  } catch (err) {
    console.error("[REGISTER ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email))
      return res.status(400).json({ message: "Invalid email address." });
    if (!password)
      return res.status(400).json({ message: "Password is required." });

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError)
      return res.status(401).json({ message: "Incorrect email or password." });

    const userId = authData.user.id;

    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .select("id, name, email, phone, business, created_at")
      .eq("id", userId)
      .single();

    if (sellerError || !seller)
      return res.status(404).json({ message: "Seller profile not found." });

    const token = signToken({
      sub: seller.id,
      email: seller.email,
      name: seller.name,
      business: seller.business,
    });

    return res.status(200).json({ message: "Login successful.", token, user: seller });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const { data: seller, error } = await supabase
      .from("sellers")
      .select("id, name, email, phone, business, created_at")
      .eq("id", req.user.sub)
      .single();

    if (error || !seller)
      return res.status(404).json({ message: "User not found." });

    return res.status(200).json({ user: seller });
  } catch (err) {
    console.error("[GET ME ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────

/**
 * PATCH /api/auth/profile
 * Protected — update name, business, phone
 */
export const updateProfile = async (req, res) => {
  try {
    const sellerId = req.user.sub;
    const { name, business, phone } = req.body;

    if (!name?.trim())
      return res.status(400).json({ message: "Full name is required." });
    if (!business?.trim())
      return res.status(400).json({ message: "Business name is required." });
    if (phone && !isValidSAPhone(phone))
      return res.status(400).json({ message: "Invalid South African phone number." });

    const { data: seller, error } = await supabase
      .from("sellers")
      .update({
        name: name.trim(),
        business: business.trim(),
        phone: phone ?? "",
      })
      .eq("id", sellerId)
      .select("id, name, email, phone, business")
      .single();

    if (error) throw error;

    return res.status(200).json({ message: "Profile updated successfully.", user: seller });
  } catch (err) {
    console.error("[UPDATE PROFILE ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── UPDATE PASSWORD ──────────────────────────────────────────────────────────

/**
 * PATCH /api/auth/password
 * Protected — change password via Supabase Auth
 */
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword)
      return res.status(400).json({ message: "Current password is required." });
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    if (!/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword))
      return res.status(400).json({ message: "Password must contain a letter and a number." });

    // Get seller's email from DB
    const { data: seller, error: sellerError } = await supabase
      .from("sellers")
      .select("email")
      .eq("id", req.user.sub)
      .single();

    if (sellerError || !seller)
      return res.status(404).json({ message: "User not found." });

    // Verify current password by signing in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: seller.email,
      password: currentPassword,
    });

    if (verifyError)
      return res.status(401).json({ message: "Current password is incorrect." });

    // Update to new password using admin client
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      req.user.sub,
      { password: newPassword }
    );

    if (updateError) throw updateError;

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("[UPDATE PASSWORD ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// GET /api/auth/notifications
// Returns notifications sent to this seller or to all sellers
export const getMyNotifications = async (req, res) => {
  try {
    const sellerId = req.user.sub;

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, title, message, sent_at")
      .or(`target_seller_id.eq.${sellerId},target_seller_id.is.null`)
      .order("sent_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.status(200).json({ notifications });
  } catch (err) {
    console.error("[GET MY NOTIFICATIONS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};
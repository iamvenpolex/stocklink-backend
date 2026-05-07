import supabase from "../config/supabase.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required." });

    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, email, password_hash")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (error || !admin)
      return res.status(401).json({ message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid)
      return res.status(401).json({ message: "Invalid email or password." });

    const token = signToken({ sub: admin.id, email: admin.email, role: "admin" });

    return res.status(200).json({ message: "Login successful.", token });
  } catch (err) {
    console.error("[ADMIN LOGIN ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── GET ADMIN ME ─────────────────────────────────────────────────────────────
export const adminMe = async (req, res) => {
  try {
    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, email")
      .eq("id", req.user.sub)
      .single();

    if (error || !admin)
      return res.status(404).json({ message: "Admin not found." });

    return res.status(200).json({ admin });
  } catch (err) {
    console.error("[ADMIN ME ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── GET STATS ────────────────────────────────────────────────────────────────
export const getStats = async (req, res) => {
  try {
    const [sellersRes, productsRes, sponsoredRes, outOfStockRes] =
      await Promise.all([
        supabase.from("sellers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_promoted", true),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("stock", 0),
      ]);

    return res.status(200).json({
      stats: {
        totalSellers: sellersRes.count ?? 0,
        totalProducts: productsRes.count ?? 0,
        sponsoredProducts: sponsoredRes.count ?? 0,
        outOfStock: outOfStockRes.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[GET STATS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── GET ALL SELLERS ──────────────────────────────────────────────────────────
export const getAllSellers = async (req, res) => {
  try {
    const { data: sellers, error } = await supabase
      .from("sellers")
      .select("id, name, email, business, phone, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({ sellers });
  } catch (err) {
    console.error("[GET ALL SELLERS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── DELETE SELLER ────────────────────────────────────────────────────────────
export const deleteSeller = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete from sellers table (cascades to products)
    const { error: dbError } = await supabase
      .from("sellers")
      .delete()
      .eq("id", id);

    if (dbError) throw dbError;

    // Delete from Supabase Auth
    await supabase.auth.admin.deleteUser(id);

    return res.status(200).json({ message: "Seller deleted." });
  } catch (err) {
    console.error("[DELETE SELLER ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── GET ALL PRODUCTS ─────────────────────────────────────────────────────────
export const getAllProducts = async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select(`
        id, name, price, category, location, stock,
        images, is_promoted, created_at,
        sellers ( name, business )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({ products });
  } catch (err) {
    console.error("[GET ALL PRODUCTS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── TOGGLE SPONSOR ───────────────────────────────────────────────────────────
export const toggleSponsor = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_promoted } = req.body;

    const { error } = await supabase
      .from("products")
      .update({ is_promoted })
      .eq("id", id);

    if (error) throw error;

    return res.status(200).json({
      message: `Product ${is_promoted ? "sponsored" : "unsponsored"} successfully.`,
    });
  } catch (err) {
    console.error("[TOGGLE SPONSOR ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── DELETE PRODUCT ───────────────────────────────────────────────────────────
export const adminDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: product, error: findError } = await supabase
      .from("products")
      .select("id, images")
      .eq("id", id)
      .single();

    if (findError || !product)
      return res.status(404).json({ message: "Product not found." });

    // Delete images from storage
    if (product.images?.length > 0) {
      const filePaths = product.images
        .map((url) => url.split("/product-images/")[1])
        .filter(Boolean);
      if (filePaths.length > 0) {
        await supabase.storage.from("product-images").remove(filePaths);
      }
    }

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return res.status(200).json({ message: "Product deleted." });
  } catch (err) {
    console.error("[ADMIN DELETE PRODUCT ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── SEND NOTIFICATION ────────────────────────────────────────────────────────
export const sendNotification = async (req, res) => {
  try {
    const { title, message, target_seller_id } = req.body;

    if (!title?.trim())
      return res.status(400).json({ message: "Title is required." });
    if (!message?.trim())
      return res.status(400).json({ message: "Message is required." });

    const { data: notification, error } = await supabase
      .from("notifications")
      .insert({
        title: title.trim(),
        message: message.trim(),
        target_seller_id: target_seller_id ?? null,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Add target label for frontend
    const enriched = {
      ...notification,
      target: target_seller_id ? "specific" : "all",
    };

    return res.status(201).json({
      message: "Notification sent.",
      notification: enriched,
    });
  } catch (err) {
    console.error("[SEND NOTIFICATION ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── GET NOTIFICATIONS HISTORY ────────────────────────────────────────────────
export const getNotifications = async (req, res) => {
  try {
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, title, message, target_seller_id, sent_at")
      .order("sent_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const enriched = notifications.map((n) => ({
      ...n,
      target: n.target_seller_id ? "specific" : "all",
    }));

    return res.status(200).json({ notifications: enriched });
  } catch (err) {
    console.error("[GET NOTIFICATIONS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};
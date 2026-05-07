import supabase from "../config/supabase.js";

export const getSellerProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: seller, error } = await supabase
      .from("sellers")
      .select("id, name, business, phone")
      .eq("id", id)
      .single();

    if (error || !seller)
      return res.status(404).json({ message: "Seller not found." });

    const { data: products } = await supabase
      .from("products")
      .select("id, name, price, discounted_price, discount, stock, images, category, location")
      .eq("seller_id", id)
      .gt("stock", 0)
      .order("created_at", { ascending: false });

    return res.status(200).json({ seller, products: products ?? [] });
  } catch (err) {
    console.error("[GET SELLER PROFILE ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};
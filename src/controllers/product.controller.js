import supabase from "../config/supabase.js";

// ─── GET ALL PUBLIC PRODUCTS (Marketplace) ───────────────────────────────────

/**
 * GET /api/products/all
 * Public — no auth required
 * Returns all in-stock products: promoted first, then newest
 */
export const getAllProducts = async (req, res) => {
  try {
    const { category, search, location } = req.query;

    let query = supabase
      .from("products")
      .select(`
        id,
        seller_id,
        name,
        category,
        location,
        price,
        discount,
        discounted_price,
        stock,
        description,
        images,
        is_promoted,
        created_at,
        sellers (
          name,
          business
        )
      `)
      .gt("stock", 0)
      .order("is_promoted", { ascending: false })
      .order("created_at", { ascending: false });

    if (category && category !== "All") {
      query = query.eq("category", category);
    }
    if (location && location !== "All") {
      query = query.eq("location", location);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data: products, error } = await query;
    if (error) throw error;

    return res.status(200).json({ products });
  } catch (err) {
    console.error("[GET ALL PRODUCTS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── CREATE PRODUCT ──────────────────────────────────────────────────────────

/**
 * POST /api/products
 * Protected — requires JWT
 *
 * IMPORTANT: Add this to your server.js to allow large image payloads:
 *   app.use(express.json({ limit: "20mb" }));
 *   app.use(express.urlencoded({ limit: "20mb", extended: true }));
 */
export const createProduct = async (req, res) => {
  try {
    const sellerId = req.user.sub;

    const {
      name,
      category,
      location,
      price,
      discount = 0,
      discounted_price,
      stock,
      description,
      images = [],
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!name?.trim())
      return res.status(400).json({ message: "Product name is required." });
    if (!category)
      return res.status(400).json({ message: "Category is required." });
    if (!location)
      return res.status(400).json({ message: "Location is required." });
    if (!price || isNaN(price) || Number(price) <= 0)
      return res.status(400).json({ message: "Enter a valid price." });
    if (stock === undefined || isNaN(stock) || Number(stock) < 0)
      return res.status(400).json({ message: "Enter a valid stock quantity." });

    // ── Upload images to Supabase Storage ────────────────────────────────────
    const imageUrls = [];

    console.log(`[IMAGE] Total received: ${images.length}`);

    for (let i = 0; i < images.length; i++) {
      const base64 = images[i];

      // Validate it's a proper data URL
      const matches = base64.match(/^data:(.+);base64,(.+)$/);
      console.log(`[IMAGE ${i}] Match found:`, !!matches);
      if (!matches) continue;

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      const ext = mimeType.split("/")[1] || "jpg";
      const fileName = `${sellerId}/${Date.now()}-${i}.${ext}`;

      console.log(`[IMAGE ${i}] Uploading: ${fileName} | size: ${buffer.length} bytes | type: ${mimeType}`);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      console.log(`[IMAGE ${i}] Upload result:`, uploadData ?? "null");
      console.log(`[IMAGE ${i}] Upload error:`, uploadError?.message ?? "none");

      if (uploadError) {
        console.error(`[IMAGE ${i}] FAILED:`, uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);

      console.log(`[IMAGE ${i}] Public URL:`, urlData.publicUrl);
      imageUrls.push(urlData.publicUrl);
    }

    console.log(`[IMAGE] Saved URLs:`, imageUrls);

    // ── Insert into products table ───────────────────────────────────────────
    const { data: product, error: dbError } = await supabase
      .from("products")
      .insert({
        seller_id: sellerId,
        name: name.trim(),
        category,
        location,
        price: Number(price),
        discount: Number(discount),
        discounted_price: Number(discounted_price ?? price),
        stock: Number(stock),
        description: description?.trim() ?? "",
        images: imageUrls,
        is_promoted: false,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return res.status(201).json({
      message: "Product added successfully.",
      product,
    });
  } catch (err) {
    console.error("[CREATE PRODUCT ERROR]", err);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ─── GET SELLER'S OWN PRODUCTS ───────────────────────────────────────────────

/**
 * GET /api/products
 * Protected — returns only the logged-in seller's products
 */
export const getMyProducts = async (req, res) => {
  try {
    const sellerId = req.user.sub;

    const { data: products, error } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({ products });
  } catch (err) {
    console.error("[GET MY PRODUCTS ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};

// ─── DELETE PRODUCT ──────────────────────────────────────────────────────────

/**
 * DELETE /api/products/:id
 * Protected — seller can only delete their own products
 */
export const deleteProduct = async (req, res) => {
  try {
    const sellerId = req.user.sub;
    const { id } = req.params;

    const { data: product, error: findError } = await supabase
      .from("products")
      .select("id, seller_id, images")
      .eq("id", id)
      .single();

    if (findError || !product)
      return res.status(404).json({ message: "Product not found." });

    if (product.seller_id !== sellerId)
      return res.status(403).json({ message: "Not authorised." });

    // Delete images from Supabase Storage
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
    console.error("[DELETE PRODUCT ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }

  
};
// ─── GET SINGLE PRODUCT ──────────────────────────────────────────────────────

/**
 * GET /api/products/:id
 * Public — no auth required
 */
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: product, error } = await supabase
      .from("products")
      .select(`
        id,
        seller_id,
        name,
        category,
        location,
        price,
        discount,
        discounted_price,
        stock,
        description,
        images,
        is_promoted,
        created_at,
        sellers (
          name,
          business,
          phone
        )
      `)
      .eq("id", id)
      .single();

    if (error || !product)
      return res.status(404).json({ message: "Product not found." });

    return res.status(200).json({ product });
  } catch (err) {
    console.error("[GET PRODUCT BY ID ERROR]", err);
    return res.status(500).json({ message: "Server error." });
  }
};
const database = require('../config/database');

/**
 * Cart Repository
 * Data access layer for carts and cart items using parameterized SQL and explicit column lists.
 */

const getCartByUserId = async (userId) => {
  const result = await database.query(
    `SELECT c.id, c.user_id, c.vendor_id, c.campus_id, c.status,
            c.created_at, c.updated_at,
            v.name AS vendor_name, v.slug AS vendor_slug,
            v.image_url AS vendor_image_url, v.status AS vendor_status,
            camp.name AS campus_name, camp.slug AS campus_slug,
            camp.is_active AS campus_is_active
       FROM public.carts AS c
       LEFT JOIN public.vendors AS v ON v.id = c.vendor_id
       LEFT JOIN public.campuses AS camp ON camp.id = c.campus_id
      WHERE c.user_id = $1
        AND c.status = 'ACTIVE'
      LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
};

const getCartById = async (cartId) => {
  const result = await database.query(
    `SELECT c.id, c.user_id, c.vendor_id, c.campus_id, c.status,
            c.created_at, c.updated_at,
            v.name AS vendor_name, v.slug AS vendor_slug,
            v.image_url AS vendor_image_url, v.status AS vendor_status,
            camp.name AS campus_name, camp.slug AS campus_slug,
            camp.is_active AS campus_is_active
       FROM public.carts AS c
       LEFT JOIN public.vendors AS v ON v.id = c.vendor_id
       LEFT JOIN public.campuses AS camp ON camp.id = c.campus_id
      WHERE c.id = $1
      LIMIT 1`,
    [cartId]
  );

  return result.rows[0] || null;
};

const getCartItemsByCartId = async (cartId) => {
  const result = await database.query(
    `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.unit_price_kobo,
            ci.created_at, ci.updated_at,
            p.name AS product_name, p.slug AS product_slug,
            p.image_url AS product_image_url, p.price_kobo AS product_current_price_kobo,
            p.is_in_stock AS product_is_in_stock, p.stock_quantity AS product_stock_quantity,
            p.vendor_id AS product_vendor_id, p.campus_id AS product_campus_id,
            v.name AS vendor_name, v.slug AS vendor_slug, v.status AS vendor_status,
            camp.name AS campus_name, camp.slug AS campus_slug, camp.is_active AS campus_is_active
       FROM public.cart_items AS ci
       JOIN public.products AS p ON p.id = ci.product_id
       JOIN public.vendors AS v ON v.id = p.vendor_id
       JOIN public.campuses AS camp ON camp.id = p.campus_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at ASC`,
    [cartId]
  );

  return result.rows;
};

const getCartItemsByUserId = async (userId) => {
  const result = await database.query(
    `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.unit_price_kobo,
            ci.created_at, ci.updated_at,
            p.name AS product_name, p.slug AS product_slug,
            p.image_url AS product_image_url, p.price_kobo AS product_current_price_kobo,
            p.is_in_stock AS product_is_in_stock, p.stock_quantity AS product_stock_quantity,
            p.vendor_id AS product_vendor_id, p.campus_id AS product_campus_id,
            v.name AS vendor_name, v.slug AS vendor_slug, v.status AS vendor_status,
            camp.name AS campus_name, camp.slug AS campus_slug, camp.is_active AS campus_is_active
       FROM public.cart_items AS ci
       JOIN public.carts AS c ON c.id = ci.cart_id
       JOIN public.products AS p ON p.id = ci.product_id
       JOIN public.vendors AS v ON v.id = p.vendor_id
       JOIN public.campuses AS camp ON camp.id = p.campus_id
      WHERE c.user_id = $1
        AND c.status = 'ACTIVE'
      ORDER BY ci.created_at ASC`,
    [userId]
  );

  return result.rows;
};

const getCartWithItems = async (userId) => {
  const cart = await getCartByUserId(userId);
  if (!cart) {
    return null;
  }

  const items = await getCartItemsByCartId(cart.id);
  return {
    ...cart,
    items,
  };
};

const createCart = async ({
  userId,
  vendorId = null,
  campusId = null,
  status = 'ACTIVE',
}) => {
  const result = await database.query(
    `INSERT INTO public.carts (user_id, vendor_id, campus_id, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, vendor_id, campus_id, status, created_at, updated_at`,
    [userId, vendorId, campusId, status]
  );

  return result.rows[0];
};

const getOrCreateCart = async (userId, initialVendorId = null, initialCampusId = null) => {
  let cart = await getCartByUserId(userId);
  if (!cart) {
    cart = await createCart({
      userId,
      vendorId: initialVendorId,
      campusId: initialCampusId,
      status: 'ACTIVE',
    });
  }
  return cart;
};

const updateCartVendorAndCampus = async (cartId, vendorId, campusId) => {
  const result = await database.query(
    `UPDATE public.carts
        SET vendor_id = $2,
            campus_id = $3,
            updated_at = now()
      WHERE id = $1
      RETURNING id, user_id, vendor_id, campus_id, status, created_at, updated_at`,
    [cartId, vendorId, campusId]
  );

  return result.rows[0] || null;
};

const getCartItemById = async (cartItemId) => {
  const result = await database.query(
    `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.unit_price_kobo,
            ci.created_at, ci.updated_at,
            c.user_id AS cart_user_id, c.vendor_id AS cart_vendor_id, c.campus_id AS cart_campus_id,
            p.name AS product_name, p.slug AS product_slug,
            p.image_url AS product_image_url, p.price_kobo AS product_current_price_kobo,
            p.is_in_stock AS product_is_in_stock, p.stock_quantity AS product_stock_quantity,
            p.vendor_id AS product_vendor_id, p.campus_id AS product_campus_id,
            v.name AS vendor_name, v.slug AS vendor_slug, v.status AS vendor_status,
            camp.name AS campus_name, camp.slug AS campus_slug, camp.is_active AS campus_is_active
       FROM public.cart_items AS ci
       JOIN public.carts AS c ON c.id = ci.cart_id
       JOIN public.products AS p ON p.id = ci.product_id
       JOIN public.vendors AS v ON v.id = p.vendor_id
       JOIN public.campuses AS camp ON camp.id = p.campus_id
      WHERE ci.id = $1
      LIMIT 1`,
    [cartItemId]
  );

  return result.rows[0] || null;
};

const getCartItemByCartAndProduct = async (cartId, productId) => {
  const result = await database.query(
    `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.unit_price_kobo,
            ci.created_at, ci.updated_at
       FROM public.cart_items AS ci
      WHERE ci.cart_id = $1
        AND ci.product_id = $2
      LIMIT 1`,
    [cartId, productId]
  );

  return result.rows[0] || null;
};

const addCartItem = async ({
  cartId,
  productId,
  quantity,
  unitPriceKobo,
}) => {
  const result = await database.query(
    `INSERT INTO public.cart_items (cart_id, product_id, quantity, unit_price_kobo)
     VALUES ($1, $2, $3, $4)
     RETURNING id, cart_id, product_id, quantity, unit_price_kobo, created_at, updated_at`,
    [cartId, productId, quantity, unitPriceKobo]
  );

  return result.rows[0];
};

const updateCartItemQuantity = async (cartItemId, quantity, unitPriceKobo = null) => {
  const result = await database.query(
    `UPDATE public.cart_items
        SET quantity = $2,
            unit_price_kobo = COALESCE($3, unit_price_kobo),
            updated_at = now()
      WHERE id = $1
      RETURNING id, cart_id, product_id, quantity, unit_price_kobo, created_at, updated_at`,
    [cartItemId, quantity, unitPriceKobo]
  );

  return result.rows[0] || null;
};

const removeCartItem = async (cartItemId) => {
  const result = await database.query(
    `DELETE FROM public.cart_items
      WHERE id = $1
      RETURNING id, cart_id, product_id, quantity, unit_price_kobo`,
    [cartItemId]
  );

  return result.rows[0] || null;
};

const clearCart = async (cartId) => {
  const result = await database.query(
    `DELETE FROM public.cart_items
      WHERE cart_id = $1
      RETURNING id, cart_id, product_id, quantity, unit_price_kobo`,
    [cartId]
  );

  return result.rows;
};

module.exports = {
  getCartByUserId,
  getCartById,
  getCartItemsByCartId,
  getCartItemsByUserId,
  getCartWithItems,
  createCart,
  getOrCreateCart,
  updateCartVendorAndCampus,
  getCartItemById,
  getCartItemByCartAndProduct,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
};

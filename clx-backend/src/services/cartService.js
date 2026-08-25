const cartRepository = require('../repositories/cartRepository');
const productRepository = require('../repositories/productRepository');
const { AppError } = require('../utils/AppError');

const MAX_QUANTITY_PER_ITEM = 99;

/**
 * Validates and normalizes quantity parameter
 * Returns integer quantity or null if invalid
 */
const parseQuantity = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0 && Number.isFinite(value)) {
      return value;
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed > 0 && Number.isFinite(parsed)) {
      return parsed;
    }
    return null;
  }

  return null;
};

/**
 * Formats cart data and computes server-side totals in integer kobo
 */
const formatCartResponse = (userId, cartRecord, items = []) => {
  const safeItems = Array.isArray(items) ? items : [];

  let itemCount = 0;
  let subtotalKobo = 0;

  const formattedItems = safeItems.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPriceKobo = Number(item.unit_price_kobo) || 0;
    const totalPriceKobo = quantity * unitPriceKobo;

    itemCount += quantity;
    subtotalKobo += totalPriceKobo;

    return {
      id: item.id,
      productId: item.product_id,
      productName: item.product_name || '',
      productSlug: item.product_slug || '',
      productImageUrl: item.product_image_url || null,
      quantity,
      unitPriceKobo,
      totalPriceKobo,
      isInStock: item.product_is_in_stock !== undefined ? Boolean(item.product_is_in_stock) : true,
      stockQuantity: item.product_stock_quantity !== null && item.product_stock_quantity !== undefined
        ? Number(item.product_stock_quantity)
        : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });

  return {
    cart: {
      id: cartRecord ? cartRecord.id : null,
      userId,
      vendorId: cartRecord && cartRecord.vendor_id ? cartRecord.vendor_id : null,
      campusId: cartRecord && cartRecord.campus_id ? cartRecord.campus_id : null,
      vendor: cartRecord && cartRecord.vendor_id && cartRecord.vendor_name ? {
        id: cartRecord.vendor_id,
        name: cartRecord.vendor_name,
        slug: cartRecord.vendor_slug,
        imageUrl: cartRecord.vendor_image_url || null,
        status: cartRecord.vendor_status || 'ACTIVE',
      } : null,
      campus: cartRecord && cartRecord.campus_id && cartRecord.campus_name ? {
        id: cartRecord.campus_id,
        name: cartRecord.campus_name,
        slug: cartRecord.campus_slug,
      } : null,
      itemCount,
      subtotalKobo,
      items: formattedItems,
      createdAt: cartRecord ? cartRecord.created_at : null,
      updatedAt: cartRecord ? cartRecord.updated_at : null,
    },
  };
};

/**
 * Get authenticated user's shopping cart
 */
const getCart = async (userId) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const cart = await cartRepository.getCartByUserId(userId);
  if (!cart) {
    return formatCartResponse(userId, null, []);
  }

  const items = await cartRepository.getCartItemsByCartId(cart.id);
  return formatCartResponse(userId, cart, items);
};

/**
 * Add a product to the authenticated user's cart
 */
const addItem = async (userId, { productId, quantity = 1 } = {}) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!productId || typeof productId !== 'string' || !productId.trim()) {
    throw new AppError(400, 'INVALID_PRODUCT', 'Product ID is required');
  }

  const parsedQuantity = parseQuantity(quantity);
  if (parsedQuantity === null) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }

  if (parsedQuantity > MAX_QUANTITY_PER_ITEM) {
    throw new AppError(
      400,
      'INVALID_QUANTITY',
      `Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM} per item`
    );
  }

  // Look up product
  const product = await productRepository.getProductByIdentifier(productId.trim());
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  }

  // Check product in stock
  if (product.is_in_stock === false) {
    throw new AppError(409, 'PRODUCT_OUT_OF_STOCK', 'Product is currently out of stock');
  }

  // Check stock quantity limits if tracked
  if (
    product.stock_quantity !== null &&
    product.stock_quantity !== undefined &&
    product.stock_quantity < parsedQuantity
  ) {
    throw new AppError(
      409,
      'PRODUCT_OUT_OF_STOCK',
      `Requested quantity (${parsedQuantity}) exceeds available stock (${product.stock_quantity})`
    );
  }

  // Verify vendor is active
  if (product.vendor_status && product.vendor_status !== 'ACTIVE') {
    throw new AppError(400, 'INVALID_PRODUCT', 'Product vendor is not currently active');
  }

  // Verify campus is active
  if (product.campus_is_active === false) {
    throw new AppError(400, 'INVALID_PRODUCT', 'Product campus is not currently active');
  }

  // Get or create active cart for user
  let cart = await cartRepository.getCartByUserId(userId);
  let existingItems = [];

  if (cart) {
    existingItems = await cartRepository.getCartItemsByCartId(cart.id);

    // Enforce single-vendor cart model if cart contains items
    if (existingItems.length > 0) {
      if (cart.vendor_id && cart.vendor_id !== product.vendor_id) {
        throw new AppError(
          409,
          'CART_VENDOR_MISMATCH',
          'A cart may contain products from one vendor and campus only'
        );
      }
    } else if (cart.vendor_id !== product.vendor_id || cart.campus_id !== product.campus_id) {
      // Cart exists but is empty -> update vendor and campus to the new product's vendor/campus
      cart = await cartRepository.updateCartVendorAndCampus(
        cart.id,
        product.vendor_id,
        product.campus_id
      );
    }
  } else {
    // Create new cart for user with product's vendor and campus
    cart = await cartRepository.createCart({
      userId,
      vendorId: product.vendor_id,
      campusId: product.campus_id,
      status: 'ACTIVE',
    });
  }

  // Check if product is already in the cart
  const existingItem = await cartRepository.getCartItemByCartAndProduct(cart.id, product.id);

  try {
    if (existingItem) {
      const newQuantity = existingItem.quantity + parsedQuantity;
      if (newQuantity > MAX_QUANTITY_PER_ITEM) {
        throw new AppError(
          400,
          'INVALID_QUANTITY',
          `Combined quantity cannot exceed ${MAX_QUANTITY_PER_ITEM} per item`
        );
      }
      if (
        product.stock_quantity !== null &&
        product.stock_quantity !== undefined &&
        product.stock_quantity < newQuantity
      ) {
        throw new AppError(
          409,
          'PRODUCT_OUT_OF_STOCK',
          `Total requested quantity (${newQuantity}) exceeds available stock (${product.stock_quantity})`
        );
      }

      await cartRepository.updateCartItemQuantity(
        existingItem.id,
        newQuantity,
        product.price_kobo
      );
    } else {
      await cartRepository.addCartItem({
        cartId: cart.id,
        productId: product.id,
        quantity: parsedQuantity,
        unitPriceKobo: product.price_kobo,
      });
    }
  } catch (error) {
    if (
      error.message &&
      error.message.includes('A cart may contain products from one vendor and campus only')
    ) {
      throw new AppError(
        409,
        'CART_VENDOR_MISMATCH',
        'A cart may contain products from one vendor and campus only'
      );
    }
    throw error;
  }

  // Re-fetch complete cart with updated items
  const updatedCart = await cartRepository.getCartById(cart.id);
  const items = await cartRepository.getCartItemsByCartId(cart.id);
  return formatCartResponse(userId, updatedCart, items);
};

/**
 * Update quantity of a cart item
 */
const updateItem = async (userId, itemId, { quantity } = {}) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Cart item ID is required');
  }

  const parsedQuantity = parseQuantity(quantity);
  if (parsedQuantity === null) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }

  if (parsedQuantity > MAX_QUANTITY_PER_ITEM) {
    throw new AppError(
      400,
      'INVALID_QUANTITY',
      `Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM} per item`
    );
  }

  const item = await cartRepository.getCartItemById(itemId.trim());
  if (!item) {
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found');
  }

  // Verify ownership
  if (item.cart_user_id !== userId) {
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found');
  }

  // Check product stock and status
  if (item.product_is_in_stock === false) {
    throw new AppError(409, 'PRODUCT_OUT_OF_STOCK', 'Product is currently out of stock');
  }

  if (
    item.product_stock_quantity !== null &&
    item.product_stock_quantity !== undefined &&
    item.product_stock_quantity < parsedQuantity
  ) {
    throw new AppError(
      409,
      'PRODUCT_OUT_OF_STOCK',
      `Requested quantity (${parsedQuantity}) exceeds available stock (${item.product_stock_quantity})`
    );
  }

  await cartRepository.updateCartItemQuantity(
    item.id,
    parsedQuantity,
    item.product_current_price_kobo
  );

  const updatedCart = await cartRepository.getCartById(item.cart_id);
  const items = await cartRepository.getCartItemsByCartId(item.cart_id);
  return formatCartResponse(userId, updatedCart, items);
};

/**
 * Remove an item from the cart
 */
const removeItem = async (userId, itemId) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Cart item ID is required');
  }

  const item = await cartRepository.getCartItemById(itemId.trim());
  if (!item) {
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found');
  }

  // Verify ownership
  if (item.cart_user_id !== userId) {
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found');
  }

  await cartRepository.removeCartItem(item.id);

  const updatedCart = await cartRepository.getCartById(item.cart_id);
  const items = await cartRepository.getCartItemsByCartId(item.cart_id);
  return formatCartResponse(userId, updatedCart, items);
};

/**
 * Clear all items from the authenticated user's cart
 */
const clearCart = async (userId) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const cart = await cartRepository.getCartByUserId(userId);
  if (!cart) {
    return formatCartResponse(userId, null, []);
  }

  await cartRepository.clearCart(cart.id);

  const updatedCart = await cartRepository.getCartById(cart.id);
  return formatCartResponse(userId, updatedCart, []);
};

module.exports = {
  MAX_QUANTITY_PER_ITEM,
  parseQuantity,
  formatCartResponse,
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};

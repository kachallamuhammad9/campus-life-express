const database = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const cartRepository = require('../repositories/cartRepository');
const productRepository = require('../repositories/productRepository');
const userRepository = require('../repositories/userRepository');
const notificationService = require('./notificationService');
const { AppError } = require('../utils/AppError');

const VALID_ORDER_TYPES = ['FOOD', 'SHOPPING'];
const VALID_PAYMENT_METHODS = ['CASH_ON_DELIVERY', 'CARD', 'BANK_TRANSFER'];

/**
 * Normalizes pagination parameters
 */
const normalizePagination = (limit, offset) => {
  let parsedLimit = parseInt(limit, 10);
  if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
    parsedLimit = 20;
  }
  if (parsedLimit > 100) {
    parsedLimit = 100;
  }

  let parsedOffset = parseInt(offset, 10);
  if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
    parsedOffset = 0;
  }

  return { limit: parsedLimit, offset: parsedOffset };
};

/**
 * Formats a single order item with integer kobo pricing
 */
const formatOrderItem = (item) => {
  const quantity = Number(item.quantity) || 0;
  const unitPriceKobo = Number(item.unit_price_kobo !== undefined ? item.unit_price_kobo : item.unitPriceKobo) || 0;
  const totalPriceKobo = Number(item.total_price_kobo !== undefined ? item.total_price_kobo : item.totalPriceKobo) || (quantity * unitPriceKobo);

  return {
    id: item.id,
    orderId: item.order_id || item.orderId,
    productId: item.product_id || item.productId,
    productName: item.product_name || item.productName || '',
    productSlug: item.product_slug || item.productSlug || '',
    productImageUrl: item.product_image_url || item.productImageUrl || null,
    quantity,
    unitPriceKobo,
    totalPriceKobo,
    createdAt: item.created_at || item.createdAt || null,
  };
};

/**
 * Formats order summary for list views
 */
const formatOrderSummary = (order) => ({
  id: order.id,
  userId: order.user_id || order.userId,
  vendorId: order.vendor_id || order.vendorId,
  campusId: order.campus_id || order.campusId,
  deliveryZoneId: order.delivery_zone_id || order.deliveryZoneId || null,
  deliveryAddress: order.delivery_address || order.deliveryAddress,
  phoneNumber: order.phone_number || order.phoneNumber,
  type: order.type,
  subtotalKobo: Number(order.subtotal_kobo !== undefined ? order.subtotal_kobo : order.subtotalKobo) || 0,
  deliveryFeeKobo: Number(order.delivery_fee_kobo !== undefined ? order.delivery_fee_kobo : (order.deliveryFeeKobo || 0)) || 0,
  serviceFeeKobo: Number(order.service_fee_kobo !== undefined ? order.service_fee_kobo : (order.serviceFeeKobo || 0)) || 0,
  totalKobo: Number(order.total_kobo !== undefined ? order.total_kobo : order.totalKobo) || 0,
  paymentMethod: order.payment_method || order.paymentMethod,
  paymentStatus: order.payment_status || order.paymentStatus,
  status: order.status,
  notes: order.notes || null,
  itemCount: order.item_count !== undefined ? Number(order.item_count) : null,
  vendor: (order.vendor_name || (order.vendor && order.vendor.name)) ? {
    id: order.vendor_id || (order.vendor && order.vendor.id),
    name: order.vendor_name || (order.vendor && order.vendor.name),
    slug: order.vendor_slug || (order.vendor && order.vendor.slug),
    imageUrl: order.vendor_image_url || (order.vendor && order.vendor.imageUrl) || null,
  } : null,
  campus: (order.campus_name || (order.campus && order.campus.name)) ? {
    id: order.campus_id || (order.campus && order.campus.id),
    name: order.campus_name || (order.campus && order.campus.name),
    slug: order.campus_slug || (order.campus && order.campus.slug),
  } : null,
  deliveryZoneName: order.delivery_zone_name || order.deliveryZoneName || null,
  createdAt: order.created_at || order.createdAt || null,
  updatedAt: order.updated_at || order.updatedAt || null,
  deliveredAt: order.delivered_at || order.deliveredAt || null,
  cancelledAt: order.cancelled_at || order.cancelledAt || null,
});

/**
 * Formats detailed order response with items and payments
 */
const formatOrderDetail = (order, items = [], payments = []) => {
  const formattedItems = items.map(formatOrderItem);
  const formattedPayments = payments.map((p) => ({
    id: p.id,
    orderId: p.order_id || p.orderId,
    provider: p.provider || null,
    providerReference: p.provider_reference || p.providerReference || null,
    amountKobo: Number(p.amount_kobo !== undefined ? p.amount_kobo : p.amountKobo) || 0,
    status: p.status,
    paidAt: p.paid_at || p.paidAt || null,
    createdAt: p.created_at || p.createdAt || null,
  }));

  const computedItemCount = formattedItems.reduce((sum, it) => sum + it.quantity, 0);

  return {
    id: order.id,
    userId: order.user_id || order.userId,
    vendorId: order.vendor_id || order.vendorId,
    campusId: order.campus_id || order.campusId,
    deliveryZoneId: order.delivery_zone_id || order.deliveryZoneId || null,
    deliveryRequestId: order.delivery_request_id || order.deliveryRequestId || null,
    deliveryAddress: order.delivery_address || order.deliveryAddress,
    phoneNumber: order.phone_number || order.phoneNumber,
    type: order.type,
    subtotalKobo: Number(order.subtotal_kobo !== undefined ? order.subtotal_kobo : order.subtotalKobo) || 0,
    deliveryFeeKobo: Number(order.delivery_fee_kobo !== undefined ? order.delivery_fee_kobo : (order.deliveryFeeKobo || 0)) || 0,
    serviceFeeKobo: Number(order.service_fee_kobo !== undefined ? order.service_fee_kobo : (order.serviceFeeKobo || 0)) || 0,
    totalKobo: Number(order.total_kobo !== undefined ? order.total_kobo : order.totalKobo) || 0,
    paymentMethod: order.payment_method || order.paymentMethod,
    paymentStatus: order.payment_status || order.paymentStatus,
    status: order.status,
    notes: order.notes || null,
    itemCount: computedItemCount,
    vendor: (order.vendor_name || (order.vendor && order.vendor.name)) ? {
      id: order.vendor_id || (order.vendor && order.vendor.id),
      name: order.vendor_name || (order.vendor && order.vendor.name),
      slug: order.vendor_slug || (order.vendor && order.vendor.slug),
      imageUrl: order.vendor_image_url || (order.vendor && order.vendor.imageUrl) || null,
    } : null,
    campus: (order.campus_name || (order.campus && order.campus.name)) ? {
      id: order.campus_id || (order.campus && order.campus.id),
      name: order.campus_name || (order.campus && order.campus.name),
      slug: order.campus_slug || (order.campus && order.campus.slug),
    } : null,
    deliveryZone: (order.delivery_zone_name || (order.deliveryZone && order.deliveryZone.name)) ? {
      id: order.delivery_zone_id || (order.deliveryZone && order.deliveryZone.id),
      name: order.delivery_zone_name || (order.deliveryZone && order.deliveryZone.name),
    } : null,
    items: formattedItems,
    payments: formattedPayments,
    createdAt: order.created_at || order.createdAt || null,
    updatedAt: order.updated_at || order.updatedAt || null,
    deliveredAt: order.delivered_at || order.deliveredAt || null,
    cancelledAt: order.cancelled_at || order.cancelledAt || null,
  };
};

/**
 * Creates an order from the authenticated user's active cart.
 * Validates stock, vendor/campus status, recalculates pricing server-side,
 * and executes within an atomic transaction.
 */
const createOrder = async (userId, payload = {}) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  // 1. Validate payload inputs
  const {
    deliveryAddress,
    phoneNumber: inputPhone,
    deliveryZoneId = null,
    paymentMethod = 'CASH_ON_DELIVERY',
    notes = null,
    type: inputType = null,
  } = payload;

  const trimmedAddress = typeof deliveryAddress === 'string' ? deliveryAddress.trim() : '';
  if (!trimmedAddress || trimmedAddress.length < 3) {
    throw new AppError(
      400,
      'INVALID_DELIVERY_ADDRESS',
      'Delivery address is required and must be at least 3 characters long'
    );
  }
  if (trimmedAddress.length > 500) {
    throw new AppError(
      400,
      'INVALID_DELIVERY_ADDRESS',
      'Delivery address must not exceed 500 characters'
    );
  }

  // Phone number resolution: body phone or fallback to user profile phone
  let finalPhoneNumber = typeof inputPhone === 'string' ? inputPhone.trim() : '';
  if (!finalPhoneNumber) {
    const userProfile = await userRepository.getUserProfileById(userId);
    if (userProfile && userProfile.phone_number) {
      finalPhoneNumber = userProfile.phone_number.trim();
    }
  }

  if (!finalPhoneNumber || finalPhoneNumber.length < 7 || finalPhoneNumber.length > 25) {
    throw new AppError(
      400,
      'INVALID_PHONE_NUMBER',
      'A valid contact phone number (7-25 characters) is required to place an order'
    );
  }

  const normalizedPaymentMethod = (paymentMethod || 'CASH_ON_DELIVERY').toUpperCase();
  if (!VALID_PAYMENT_METHODS.includes(normalizedPaymentMethod)) {
    throw new AppError(
      400,
      'INVALID_PAYMENT_METHOD',
      `Payment method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`
    );
  }

  if (inputType && !VALID_ORDER_TYPES.includes(inputType.toUpperCase())) {
    throw new AppError(
      400,
      'INVALID_ORDER_TYPE',
      `Order type must be one of: ${VALID_ORDER_TYPES.join(', ')}`
    );
  }

  // 2. Retrieve user's active cart and items
  const cart = await cartRepository.getCartByUserId(userId);
  if (!cart) {
    throw new AppError(404, 'CART_NOT_FOUND', 'Active shopping cart not found');
  }

  const cartItems = await cartRepository.getCartItemsByCartId(cart.id);
  if (!cartItems || cartItems.length === 0) {
    throw new AppError(400, 'CART_EMPTY', 'Your cart is empty. Add products before placing an order');
  }

  // 3. Verify products, availability, vendor, campus, and calculate pricing
  const validatedItems = [];
  let subtotalKobo = 0;
  let orderVendorId = cart.vendor_id;
  let orderCampusId = cart.campus_id;

  for (const item of cartItems) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Invalid quantity for cart item');
    }

    const product = await productRepository.getProductByIdentifier(item.product_id);
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product with ID ${item.product_id} was not found`);
    }

    if (product.is_in_stock === false) {
      throw new AppError(409, 'PRODUCT_OUT_OF_STOCK', `Product "${product.name}" is currently out of stock`);
    }

    if (
      product.stock_quantity !== null &&
      product.stock_quantity !== undefined &&
      Number(product.stock_quantity) < quantity
    ) {
      throw new AppError(
        409,
        'PRODUCT_OUT_OF_STOCK',
        `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, requested: ${quantity}`
      );
    }

    if (product.vendor_status && product.vendor_status !== 'ACTIVE') {
      throw new AppError(
        409,
        'PRODUCT_UNAVAILABLE',
        `Vendor "${product.vendor_name || 'Vendor'}" is currently not active`
      );
    }

    if (product.campus_is_active === false) {
      throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Campus is currently inactive');
    }

    const unitPriceKobo = Number(product.price_kobo);
    if (!Number.isInteger(unitPriceKobo) || unitPriceKobo < 0) {
      throw new AppError(500, 'INVALID_PRICE', 'Product price configuration is invalid');
    }

    const totalPriceKobo = quantity * unitPriceKobo;
    subtotalKobo += totalPriceKobo;

    if (!orderVendorId) {
      orderVendorId = product.vendor_id;
    }
    if (!orderCampusId) {
      orderCampusId = product.campus_id;
    }

    validatedItems.push({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      productImageUrl: product.image_url || null,
      quantity,
      unitPriceKobo,
      totalPriceKobo,
      stockQuantity: product.stock_quantity,
    });
  }

  // 4. Validate Delivery Zone and Delivery Fee
  let deliveryFeeKobo = 0;
  let zoneRecord = null;
  if (deliveryZoneId) {
    zoneRecord = await orderRepository.getDeliveryZoneById(deliveryZoneId);
    if (!zoneRecord || !zoneRecord.is_active || zoneRecord.campus_id !== orderCampusId) {
      throw new AppError(
        400,
        'INVALID_DELIVERY_ZONE',
        'Specified delivery zone is invalid or inactive for this campus'
      );
    }
    deliveryFeeKobo = Number(zoneRecord.base_delivery_fee_kobo || 0);
  }

  const serviceFeeKobo = 0;
  const totalKobo = subtotalKobo + deliveryFeeKobo + serviceFeeKobo;

  // Determine order type
  let resolvedType = inputType ? inputType.toUpperCase() : null;
  if (!resolvedType) {
    const categorySlug = (cart.vendor_slug || '').toLowerCase();
    resolvedType = categorySlug.includes('food') || categorySlug.includes('restaurant') ? 'FOOD' : 'SHOPPING';
  }

  // 5. Execute Atomic Transaction
  const executeOrderCreation = async (client) => {
    // 5a. Create order record
    const createdOrder = await orderRepository.createOrder({
      userId,
      vendorId: orderVendorId,
      campusId: orderCampusId,
      deliveryZoneId: deliveryZoneId || null,
      deliveryAddress: trimmedAddress,
      phoneNumber: finalPhoneNumber,
      type: resolvedType,
      subtotalKobo,
      deliveryFeeKobo,
      serviceFeeKobo,
      totalKobo,
      paymentMethod: normalizedPaymentMethod,
      paymentStatus: 'PENDING',
      status: 'PENDING',
      notes: typeof notes === 'string' ? notes.trim() || null : null,
    }, client);

    // 5b. Create order items (price snapshot at moment of checkout)
    const createdItems = await orderRepository.createOrderItems(
      createdOrder.id,
      validatedItems,
      client
    );

    // 5c. Decrement product stock if tracked
    for (const item of validatedItems) {
      if (item.stockQuantity !== null && item.stockQuantity !== undefined) {
        await orderRepository.decrementProductStock(item.productId, item.quantity, client);
      }
    }

    // 5d. Create initial payment record
    const createdPayment = await orderRepository.createOrderPayment({
      orderId: createdOrder.id,
      amountKobo: totalKobo,
      status: 'PENDING',
    }, client);

    // 5e. Clear cart items
    await orderRepository.clearCartItems(cart.id, client);

    return {
      order: createdOrder,
      items: createdItems,
      payment: createdPayment,
    };
  };

  let transactionResult;
  try {
    if (typeof database.withTransaction === 'function') {
      transactionResult = await database.withTransaction(executeOrderCreation);
    } else {
      transactionResult = await executeOrderCreation(null);
    }
  } catch (txError) {
    if (txError instanceof AppError) {
      throw txError;
    }
    throw new AppError(500, 'ORDER_CREATION_FAILED', 'Failed to create order due to a database error');
  }

  const { order: createdOrder, items: createdItems, payment: createdPayment } = transactionResult;

  // Build complete formatted order response
  const orderDetails = {
    ...createdOrder,
    vendor_name: cart.vendor_name,
    vendor_slug: cart.vendor_slug,
    vendor_image_url: cart.vendor_image_url,
    campus_name: cart.campus_name,
    campus_slug: cart.campus_slug,
    delivery_zone_name: zoneRecord ? zoneRecord.name : null,
  };

  // Merge product metadata onto created order items
  const itemsWithMeta = createdItems.map((ci) => {
    const original = validatedItems.find((v) => v.productId === ci.product_id) || {};
    return {
      ...ci,
      product_name: original.productName,
      product_slug: original.productSlug,
      product_image_url: original.productImageUrl,
    };
  });

  const formattedOrder = formatOrderDetail(orderDetails, itemsWithMeta, createdPayment ? [createdPayment] : []);

  // Dispatch asynchronous in-app and email notification safely without blocking or throwing
  notificationService.notifyOrderCreated(formattedOrder).catch((err) => {
    console.warn('[OrderService] Non-fatal notification error:', err.message);
  });

  return {
    order: formattedOrder,
  };
};

/**
 * Retrieves all orders belonging to the authenticated user
 */
const getUserOrders = async (userId, query = {}) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  const { limit, offset } = normalizePagination(query.limit, query.offset);
  const orders = await orderRepository.getOrdersByUserId(userId, { limit, offset });

  return {
    orders: (orders || []).map(formatOrderSummary),
    pagination: {
      limit,
      offset,
      count: orders ? orders.length : 0,
    },
  };
};

/**
 * Retrieves a single order belonging to the authenticated user
 */
const getUserOrderDetails = async (userId, orderId) => {
  if (!userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }

  if (!orderId) {
    throw new AppError(400, 'INVALID_ORDER_ID', 'Order ID is required');
  }

  const order = await orderRepository.getOrderById(orderId);
  if (!order || order.user_id !== userId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  const items = await orderRepository.getOrderItemsByOrderId(order.id);
  const payments = await orderRepository.getOrderPaymentsByOrderId(order.id);

  return {
    order: formatOrderDetail(order, items, payments),
  };
};

module.exports = {
  createOrder,
  getUserOrders,
  getUserOrderDetails,
  normalizePagination,
  formatOrderItem,
  formatOrderSummary,
  formatOrderDetail,
};

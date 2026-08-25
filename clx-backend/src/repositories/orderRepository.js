const database = require('../config/database');

/**
 * Order Repository
 * Data access layer for orders, order items, and order payments.
 * Uses parameterized SQL and explicit column lists.
 */

const getExecutor = (client) => client || database;

const createOrder = async ({
  userId,
  vendorId,
  campusId,
  deliveryZoneId = null,
  deliveryRequestId = null,
  deliveryAddress,
  phoneNumber,
  type = 'FOOD',
  subtotalKobo,
  deliveryFeeKobo = 0,
  serviceFeeKobo = 0,
  totalKobo,
  paymentMethod = 'CASH_ON_DELIVERY',
  paymentStatus = 'PENDING',
  status = 'PENDING',
  notes = null,
}, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `INSERT INTO public.orders (
       user_id,
       vendor_id,
       campus_id,
       delivery_zone_id,
       delivery_request_id,
       delivery_address,
       phone_number,
       type,
       subtotal_kobo,
       delivery_fee_kobo,
       service_fee_kobo,
       total_kobo,
       payment_method,
       payment_status,
       status,
       notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id, user_id, vendor_id, campus_id, delivery_zone_id, delivery_request_id,
               delivery_address, phone_number, type, subtotal_kobo, delivery_fee_kobo,
               service_fee_kobo, total_kobo, payment_method, payment_status, status,
               notes, created_at, updated_at, delivered_at, cancelled_at`,
    [
      userId,
      vendorId,
      campusId,
      deliveryZoneId,
      deliveryRequestId,
      deliveryAddress,
      phoneNumber,
      type,
      subtotalKobo,
      deliveryFeeKobo,
      serviceFeeKobo,
      totalKobo,
      paymentMethod,
      paymentStatus,
      status,
      notes,
    ]
  );

  return result.rows[0];
};

const createOrderItem = async ({
  orderId,
  productId,
  quantity,
  unitPriceKobo,
  totalPriceKobo,
}, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `INSERT INTO public.order_items (
       order_id,
       product_id,
       quantity,
       unit_price_kobo,
       total_price_kobo
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, order_id, product_id, quantity, unit_price_kobo, total_price_kobo, created_at`,
    [orderId, productId, quantity, unitPriceKobo, totalPriceKobo]
  );

  return result.rows[0];
};

const createOrderItems = async (orderId, items, client = null) => {
  const createdItems = [];
  for (const item of items) {
    const created = await createOrderItem({
      orderId,
      productId: item.productId || item.product_id,
      quantity: item.quantity,
      unitPriceKobo: item.unitPriceKobo || item.unit_price_kobo,
      totalPriceKobo: item.totalPriceKobo || item.total_price_kobo,
    }, client);
    createdItems.push(created);
  }
  return createdItems;
};

const createOrderPayment = async ({
  orderId,
  provider = null,
  providerReference = null,
  amountKobo,
  status = 'PENDING',
}, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `INSERT INTO public.order_payments (
       order_id,
       provider,
       provider_reference,
       amount_kobo,
       status
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, order_id, provider, provider_reference, amount_kobo, status, paid_at, created_at`,
    [orderId, provider, providerReference, amountKobo, status]
  );

  return result.rows[0];
};

const decrementProductStock = async (productId, quantity, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `UPDATE public.products
        SET stock_quantity = stock_quantity - $2,
            updated_at = now()
      WHERE id = $1
        AND stock_quantity IS NOT NULL
        AND stock_quantity >= $2
      RETURNING id, stock_quantity`,
    [productId, quantity]
  );

  return result.rows[0] || null;
};

const clearCartItems = async (cartId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `DELETE FROM public.cart_items
      WHERE cart_id = $1
      RETURNING id, cart_id, product_id, quantity, unit_price_kobo`,
    [cartId]
  );

  return result.rows;
};

const getOrdersByUserId = async (userId, { limit = 20, offset = 0 } = {}) => {
  const result = await database.query(
    `SELECT o.id, o.user_id, o.vendor_id, o.campus_id, o.delivery_zone_id,
            o.delivery_request_id, o.delivery_address, o.phone_number, o.type,
            o.subtotal_kobo, o.delivery_fee_kobo, o.service_fee_kobo, o.total_kobo,
            o.payment_method, o.payment_status, o.status, o.notes,
            o.created_at, o.updated_at, o.delivered_at, o.cancelled_at,
            v.name AS vendor_name, v.slug AS vendor_slug, v.image_url AS vendor_image_url,
            camp.name AS campus_name, camp.slug AS campus_slug,
            dz.name AS delivery_zone_name,
            (
              SELECT COUNT(*)::int
                FROM public.order_items AS oi
               WHERE oi.order_id = o.id
            ) AS item_count
       FROM public.orders AS o
       JOIN public.vendors AS v ON v.id = o.vendor_id
       JOIN public.campuses AS camp ON camp.id = o.campus_id
  LEFT JOIN public.delivery_zones AS dz ON dz.id = o.delivery_zone_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
};

const getOrderById = async (orderId) => {
  const result = await database.query(
    `SELECT o.id, o.user_id, o.vendor_id, o.campus_id, o.delivery_zone_id,
            o.delivery_request_id, o.delivery_address, o.phone_number, o.type,
            o.subtotal_kobo, o.delivery_fee_kobo, o.service_fee_kobo, o.total_kobo,
            o.payment_method, o.payment_status, o.status, o.notes,
            o.created_at, o.updated_at, o.delivered_at, o.cancelled_at,
            v.name AS vendor_name, v.slug AS vendor_slug, v.image_url AS vendor_image_url,
            camp.name AS campus_name, camp.slug AS campus_slug,
            dz.name AS delivery_zone_name
       FROM public.orders AS o
       JOIN public.vendors AS v ON v.id = o.vendor_id
       JOIN public.campuses AS camp ON camp.id = o.campus_id
  LEFT JOIN public.delivery_zones AS dz ON dz.id = o.delivery_zone_id
      WHERE o.id = $1
      LIMIT 1`,
    [orderId]
  );

  return result.rows[0] || null;
};

const getOrderItemsByOrderId = async (orderId) => {
  const result = await database.query(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price_kobo,
            oi.total_price_kobo, oi.created_at,
            p.name AS product_name, p.slug AS product_slug, p.image_url AS product_image_url
       FROM public.order_items AS oi
       JOIN public.products AS p ON p.id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC`,
    [orderId]
  );

  return result.rows;
};

const getOrderPaymentsByOrderId = async (orderId) => {
  const result = await database.query(
    `SELECT op.id, op.order_id, op.provider, op.provider_reference,
            op.amount_kobo, op.status, op.paid_at, op.created_at
       FROM public.order_payments AS op
      WHERE op.order_id = $1
      ORDER BY op.created_at DESC`,
    [orderId]
  );

  return result.rows;
};

const getDeliveryZoneById = async (zoneId) => {
  const result = await database.query(
    `SELECT dz.id, dz.campus_id, dz.name, dz.description,
            dz.base_delivery_fee_kobo, dz.is_active, dz.created_at, dz.updated_at
       FROM public.delivery_zones AS dz
      WHERE dz.id = $1
      LIMIT 1`,
    [zoneId]
  );

  return result.rows[0] || null;
};

const updateOrderStatus = async (orderId, status) => {
  const result = await database.query(
    `UPDATE public.orders
        SET status = $2,
            updated_at = now(),
            delivered_at = CASE WHEN $2 = 'DELIVERED' THEN now() ELSE delivered_at END,
            cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() ELSE cancelled_at END
      WHERE id = $1
      RETURNING id, user_id, vendor_id, campus_id, status, updated_at, delivered_at, cancelled_at`,
    [orderId, status]
  );

  return result.rows[0] || null;
};

module.exports = {
  createOrder,
  createOrderItem,
  createOrderItems,
  createOrderPayment,
  decrementProductStock,
  clearCartItems,
  getOrdersByUserId,
  getOrderById,
  getOrderItemsByOrderId,
  getOrderPaymentsByOrderId,
  getDeliveryZoneById,
  updateOrderStatus,
};

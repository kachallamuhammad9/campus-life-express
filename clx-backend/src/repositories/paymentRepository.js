const database = require('../config/database');

/**
 * Payment Repository
 * Data access layer for order payments.
 * Uses parameterized SQL and explicit column lists.
 */

const getExecutor = (client) => client || database;

/**
 * Retrieves an order by ID for payment operations
 */
const getOrderById = async (orderId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT id, user_id, vendor_id, campus_id, delivery_zone_id,
            delivery_request_id, delivery_address, phone_number,
            type, subtotal_kobo, delivery_fee_kobo, service_fee_kobo,
            total_kobo, payment_method, payment_status, status,
            notes, created_at, updated_at, delivered_at, cancelled_at
       FROM public.orders
      WHERE id = $1
      LIMIT 1`,
    [orderId]
  );

  return result.rows[0] || null;
};

/**
 * Retrieves a single payment record by ID with joined order context
 */
const getPaymentById = async (paymentId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT op.id, op.order_id, op.provider, op.provider_reference,
            op.amount_kobo, op.status, op.paid_at, op.created_at,
            o.user_id, o.payment_method, o.total_kobo,
            o.status AS order_status, o.payment_status AS order_payment_status
       FROM public.order_payments AS op
       JOIN public.orders AS o ON o.id = op.order_id
      WHERE op.id = $1
      LIMIT 1`,
    [paymentId]
  );

  return result.rows[0] || null;
};

/**
 * Retrieves all payment records associated with an order
 */
const getPaymentsByOrderId = async (orderId, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT id, order_id, provider, provider_reference,
            amount_kobo, status, paid_at, created_at
       FROM public.order_payments
      WHERE order_id = $1
      ORDER BY created_at DESC`,
    [orderId]
  );

  return result.rows;
};

/**
 * Retrieves a payment by provider and provider reference (for webhook idempotency)
 */
const getPaymentByProviderReference = async (provider, providerReference, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `SELECT op.id, op.order_id, op.provider, op.provider_reference,
            op.amount_kobo, op.status, op.paid_at, op.created_at,
            o.user_id, o.payment_method, o.total_kobo,
            o.status AS order_status, o.payment_status AS order_payment_status
       FROM public.order_payments AS op
       JOIN public.orders AS o ON o.id = op.order_id
      WHERE op.provider = $1
        AND op.provider_reference = $2
      LIMIT 1`,
    [provider, providerReference]
  );

  return result.rows[0] || null;
};

/**
 * Creates a new order payment record
 */
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

/**
 * Updates a payment record's status and optional paid_at / provider metadata
 */
const updatePaymentStatus = async (paymentId, status, {
  paidAt = null,
  provider = null,
  providerReference = null,
} = {}, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `UPDATE public.order_payments
        SET status = $2,
            paid_at = COALESCE($3, paid_at),
            provider = COALESCE($4, provider),
            provider_reference = COALESCE($5, provider_reference)
      WHERE id = $1
      RETURNING id, order_id, provider, provider_reference, amount_kobo, status, paid_at, created_at`,
    [paymentId, status, paidAt, provider, providerReference]
  );

  return result.rows[0] || null;
};

/**
 * Updates an order's payment info and optional status
 */
const updateOrderPaymentInfo = async (orderId, {
  paymentMethod = null,
  paymentStatus = null,
  orderStatus = null,
} = {}, client = null) => {
  const executor = getExecutor(client);
  const result = await executor.query(
    `UPDATE public.orders
        SET payment_method = COALESCE($2, payment_method),
            payment_status = COALESCE($3, payment_status),
            status = COALESCE($4, status),
            updated_at = now()
      WHERE id = $1
      RETURNING id, user_id, payment_method, payment_status, status, total_kobo`,
    [orderId, paymentMethod, paymentStatus, orderStatus]
  );

  return result.rows[0] || null;
};

module.exports = {
  getOrderById,
  getPaymentById,
  getPaymentsByOrderId,
  getPaymentByProviderReference,
  createOrderPayment,
  updatePaymentStatus,
  updateOrderPaymentInfo,
};

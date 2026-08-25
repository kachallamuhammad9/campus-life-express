const paymentRepository = require('../repositories/paymentRepository');
const { AppError } = require('../utils/AppError');

/**
 * Payment Service
 * Business logic for order payments, Cash on Delivery, and payment status lifecycles.
 */

const VALID_PAYMENT_METHODS = ['CASH_ON_DELIVERY', 'CARD', 'BANK_TRANSFER'];
const VALID_PAYMENT_STATUSES = ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

const ALLOWED_PAYMENT_TRANSITIONS = {
  PENDING: new Set(['AUTHORIZED', 'PAID', 'FAILED']),
  AUTHORIZED: new Set(['PAID', 'FAILED']),
  PAID: new Set(['REFUNDED', 'PARTIALLY_REFUNDED']),
  FAILED: new Set(['PENDING']),
  REFUNDED: new Set([]),
  PARTIALLY_REFUNDED: new Set(['REFUNDED']),
};

/**
 * Formats a payment record for API responses
 */
const formatPayment = (payment) => {
  if (!payment) return null;
  const amountKobo = Number.parseInt(
    payment.amount_kobo !== undefined ? payment.amount_kobo : payment.amountKobo,
    10
  );

  return {
    id: payment.id,
    orderId: payment.order_id || payment.orderId,
    provider: payment.provider || null,
    providerReference: payment.provider_reference || payment.providerReference || null,
    amountKobo,
    amountNgn: Number.isFinite(amountKobo) ? amountKobo / 100 : 0,
    status: payment.status,
    paidAt: payment.paid_at || payment.paidAt || null,
    createdAt: payment.created_at || payment.createdAt || null,
  };
};

/**
 * Helper to check whether user has administrative privileges
 */
const isUserAdmin = (user) => {
  if (!user) return false;
  const roles = user.roles || (user.role ? [user.role] : []);
  return roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
};

/**
 * Retrieves payments for a specific order
 */
const getOrderPayments = async (orderId, user) => {
  if (!orderId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Order ID is required');
  }

  const order = await paymentRepository.getOrderById(orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  // Cross-user ownership protection
  if (order.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  const payments = await paymentRepository.getPaymentsByOrderId(orderId);
  const totalKobo = Number.parseInt(order.total_kobo, 10);

  return {
    orderId: order.id,
    orderStatus: order.status,
    orderPaymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    totalKobo,
    totalNgn: totalKobo / 100,
    payments: payments.map(formatPayment),
  };
};

/**
 * Retrieves a single payment record by ID
 */
const getPaymentById = async (paymentId, user) => {
  if (!paymentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payment ID is required');
  }

  const payment = await paymentRepository.getPaymentById(paymentId);
  if (!payment) {
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record was not found');
  }

  // Cross-user ownership protection
  if (payment.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record was not found');
  }

  return {
    payment: formatPayment(payment),
    orderId: payment.order_id,
    orderStatus: payment.order_status,
    orderPaymentStatus: payment.order_payment_status,
  };
};

/**
 * Confirms Cash on Delivery for an order
 */
const confirmCashOnDelivery = async (orderId, user) => {
  if (!orderId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Order ID is required');
  }

  const order = await paymentRepository.getOrderById(orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  if (order.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  if (order.status === 'CANCELLED') {
    throw new AppError(400, 'ORDER_CANCELLED', 'Cannot set Cash on Delivery for a cancelled order');
  }

  if (order.payment_status === 'PAID') {
    throw new AppError(400, 'ORDER_ALREADY_PAID', 'Order has already been paid');
  }

  if (order.payment_status === 'REFUNDED' || order.payment_status === 'PARTIALLY_REFUNDED') {
    throw new AppError(400, 'INVALID_PAYMENT_STATE', 'Cannot set Cash on Delivery for a refunded order');
  }

  const totalKobo = Number.parseInt(order.total_kobo, 10);

  // Check existing payments for this order
  const existingPayments = await paymentRepository.getPaymentsByOrderId(orderId);
  let paymentRecord = existingPayments.find((p) => p.status === 'PENDING');

  if (!paymentRecord) {
    paymentRecord = await paymentRepository.createOrderPayment({
      orderId: order.id,
      provider: 'CASH_ON_DELIVERY',
      providerReference: null,
      amountKobo: totalKobo,
      status: 'PENDING',
    });
  } else if (paymentRecord.provider !== 'CASH_ON_DELIVERY') {
    paymentRecord = await paymentRepository.updatePaymentStatus(paymentRecord.id, 'PENDING', {
      provider: 'CASH_ON_DELIVERY',
    });
  }

  await paymentRepository.updateOrderPaymentInfo(order.id, {
    paymentMethod: 'CASH_ON_DELIVERY',
    paymentStatus: 'PENDING',
  });

  return {
    success: true,
    message: 'Cash on Delivery confirmed for order',
    orderId: order.id,
    paymentMethod: 'CASH_ON_DELIVERY',
    paymentStatus: 'PENDING',
    totalKobo,
    totalNgn: totalKobo / 100,
    payment: formatPayment(paymentRecord),
  };
};

/**
 * Initializes payment for an order with server-authoritative amount
 */
const initializePayment = async (orderId, user, {
  paymentMethod = 'CARD',
  provider = 'GENERIC',
} = {}) => {
  if (!orderId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Order ID is required');
  }

  const order = await paymentRepository.getOrderById(orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  if (order.user_id !== user.id && !isUserAdmin(user)) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order was not found');
  }

  const normalizedMethod = (paymentMethod || 'CARD').toUpperCase();
  if (!VALID_PAYMENT_METHODS.includes(normalizedMethod)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid payment method. Allowed methods: ${VALID_PAYMENT_METHODS.join(', ')}`
    );
  }

  // If Cash on Delivery is requested, route to COD confirmation
  if (normalizedMethod === 'CASH_ON_DELIVERY') {
    return confirmCashOnDelivery(orderId, user);
  }

  if (order.status === 'CANCELLED') {
    throw new AppError(400, 'ORDER_CANCELLED', 'Cannot initiate payment for a cancelled order');
  }

  if (order.payment_status === 'PAID') {
    throw new AppError(400, 'ORDER_ALREADY_PAID', 'Order has already been paid');
  }

  // Server-authoritative integer kobo total
  const authoritativeTotalKobo = Number.parseInt(order.total_kobo, 10);
  const normalizedProvider = (provider || 'GENERIC').toUpperCase();
  const providerReference = `CLX_PAY_${order.id.replace(/-/g, '').substring(0, 8)}_${Date.now()}`;

  const createdPayment = await paymentRepository.createOrderPayment({
    orderId: order.id,
    provider: normalizedProvider,
    providerReference,
    amountKobo: authoritativeTotalKobo,
    status: 'PENDING',
  });

  await paymentRepository.updateOrderPaymentInfo(order.id, {
    paymentMethod: normalizedMethod,
    paymentStatus: 'PENDING',
  });

  return {
    success: true,
    message: 'Payment initialized successfully',
    orderId: order.id,
    paymentId: createdPayment.id,
    provider: createdPayment.provider,
    providerReference: createdPayment.provider_reference,
    amountKobo: authoritativeTotalKobo,
    amountNgn: authoritativeTotalKobo / 100,
    paymentMethod: normalizedMethod,
    paymentStatus: 'PENDING',
    authorizationUrl: null,
    accessCode: null,
    payment: formatPayment(createdPayment),
  };
};

/**
 * Updates payment status following strict state transitions
 */
const updatePaymentStatus = async (paymentId, newStatus, {
  paidAt = null,
  provider = null,
  providerReference = null,
} = {}) => {
  if (!paymentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payment ID is required');
  }

  const normalizedStatus = (newStatus || '').toUpperCase();
  if (!VALID_PAYMENT_STATUSES.includes(normalizedStatus)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid payment status. Allowed: ${VALID_PAYMENT_STATUSES.join(', ')}`
    );
  }

  const payment = await paymentRepository.getPaymentById(paymentId);
  if (!payment) {
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment record was not found');
  }

  const currentStatus = payment.status;
  const allowed = ALLOWED_PAYMENT_TRANSITIONS[currentStatus];

  if (!allowed || !allowed.has(normalizedStatus)) {
    throw new AppError(
      400,
      'INVALID_PAYMENT_TRANSITION',
      `Cannot transition payment status from ${currentStatus} to ${normalizedStatus}`
    );
  }

  let effectivePaidAt = paidAt;
  if (normalizedStatus === 'PAID' && !effectivePaidAt) {
    effectivePaidAt = new Date().toISOString();
  }

  const updatedPayment = await paymentRepository.updatePaymentStatus(paymentId, normalizedStatus, {
    paidAt: effectivePaidAt,
    provider,
    providerReference,
  });

  // Synchronize order's payment_status and advance order to CONFIRMED if appropriate
  let targetOrderStatus = null;
  if (normalizedStatus === 'PAID' && payment.order_status === 'PENDING') {
    targetOrderStatus = 'CONFIRMED';
  }

  await paymentRepository.updateOrderPaymentInfo(payment.order_id, {
    paymentStatus: normalizedStatus,
    orderStatus: targetOrderStatus,
  });

  return formatPayment(updatedPayment);
};

/**
 * Provider-agnostic webhook handler stub with idempotency protection
 */
const handleWebhook = async (payload, signature = null, headers = {}) => {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    throw new AppError(400, 'INVALID_WEBHOOK_PAYLOAD', 'Webhook payload is empty or invalid');
  }

  const provider = (payload.provider || headers['x-payment-provider'] || 'GENERIC').toUpperCase();
  const providerReference = payload.providerReference || payload.reference || payload.data?.reference || null;

  // Idempotency check if provider reference is present
  if (providerReference) {
    const existingPayment = await paymentRepository.getPaymentByProviderReference(
      provider,
      providerReference
    );

    if (existingPayment) {
      if (existingPayment.status === 'PAID' || existingPayment.status === 'REFUNDED') {
        return {
          received: true,
          idempotent: true,
          status: existingPayment.status,
          message: 'Webhook event already processed',
        };
      }
    }
  }

  // In this phase (stub mode without live provider configuration),
  // do NOT blindly mark payments as PAID without authenticated signature verification.
  return {
    received: true,
    verified: false,
    stub: true,
    provider,
    providerReference,
    message: 'Provider-agnostic webhook received in stub mode. Signature verification not configured.',
  };
};

module.exports = {
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_STATUSES,
  ALLOWED_PAYMENT_TRANSITIONS,
  formatPayment,
  getOrderPayments,
  getPaymentById,
  confirmCashOnDelivery,
  initializePayment,
  updatePaymentStatus,
  handleWebhook,
};

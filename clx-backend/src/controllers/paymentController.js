const paymentService = require('../services/paymentService');
const { sendSuccess } = require('../utils/response');

/**
 * Payment Controller
 * Handles HTTP requests for order payments and webhooks.
 */

const getOrderPayments = async (req, res) => {
  const result = await paymentService.getOrderPayments(req.params.orderId, req.user);
  return sendSuccess(res, result, 200);
};

const getPaymentDetails = async (req, res) => {
  const result = await paymentService.getPaymentById(req.params.paymentId, req.user);
  return sendSuccess(res, result, 200);
};

const initializePayment = async (req, res) => {
  const orderId = req.body?.orderId || req.params.orderId;
  const result = await paymentService.initializePayment(orderId, req.user, req.body || {});
  return sendSuccess(res, result, 200);
};

const confirmCashOnDelivery = async (req, res) => {
  const orderId = req.body?.orderId || req.params.orderId;
  const result = await paymentService.confirmCashOnDelivery(orderId, req.user);
  return sendSuccess(res, result, 200);
};

const handleWebhook = async (req, res) => {
  const signature = req.headers['x-paystack-signature'] || null;
  const result = await paymentService.handleWebhook(req.body, signature, req.rawBody);
  return sendSuccess(res, result, 200);
};

const handleCallback = async (req, res) => {
  const result = await paymentService.handleCallback(req.query?.reference);
  return sendSuccess(res, result, 200);
};

module.exports = {
  getOrderPayments,
  getPaymentDetails,
  initializePayment,
  confirmCashOnDelivery,
  handleWebhook,
  handleCallback,
};

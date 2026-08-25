const orderService = require('../services/orderService');
const { sendSuccess } = require('../utils/response');

const createOrder = async (req, res) => {
  const result = await orderService.createOrder(req.user.id, req.body);
  return sendSuccess(res, result, 201);
};

const getOrders = async (req, res) => {
  const result = await orderService.getUserOrders(req.user.id, req.query);
  return sendSuccess(res, result, 200);
};

const getOrder = async (req, res) => {
  const result = await orderService.getUserOrderDetails(req.user.id, req.params.orderId);
  return sendSuccess(res, result, 200);
};

module.exports = {
  createOrder,
  getOrders,
  getOrder,
};

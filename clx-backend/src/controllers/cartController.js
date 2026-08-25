const cartService = require('../services/cartService');
const { sendSuccess } = require('../utils/response');

const getCart = async (req, res) => {
  const result = await cartService.getCart(req.user.id);
  return sendSuccess(res, result);
};

const addItem = async (req, res) => {
  const result = await cartService.addItem(req.user.id, req.body);
  return sendSuccess(res, result, 200);
};

const updateItem = async (req, res) => {
  const result = await cartService.updateItem(
    req.user.id,
    req.params.itemId,
    req.body
  );
  return sendSuccess(res, result);
};

const removeItem = async (req, res) => {
  const result = await cartService.removeItem(
    req.user.id,
    req.params.itemId
  );
  return sendSuccess(res, result);
};

const clearCart = async (req, res) => {
  const result = await cartService.clearCart(req.user.id);
  return sendSuccess(res, result);
};

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};

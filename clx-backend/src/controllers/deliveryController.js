const deliveryService = require('../services/deliveryService');
const { sendSuccess } = require('../utils/response');

/**
 * Delivery Controller
 * Handles HTTP requests for campus deliveries and errands.
 */

const getUserRoles = (user) => {
  if (!user) return [];
  const roles = [];
  if (user.role) roles.push(user.role);
  if (Array.isArray(user.roles)) {
    for (const r of user.roles) {
      if (!roles.includes(r)) roles.push(r);
    }
  }
  return roles;
};

const createDelivery = async (req, res) => {
  const result = await deliveryService.createDelivery(req.user.id, req.body);
  return sendSuccess(res, result, 201);
};

const getCustomerDeliveries = async (req, res) => {
  const result = await deliveryService.getCustomerDeliveries(req.user.id, req.query);
  return sendSuccess(res, result, 200);
};

const getRiderAssignedDeliveries = async (req, res) => {
  const result = await deliveryService.getRiderAssignedDeliveries(req.user.id, req.query);
  return sendSuccess(res, result, 200);
};

const getAvailableDeliveries = async (req, res) => {
  const campusIdentifier = req.query.campusId || req.query.campus_id || null;
  const result = await deliveryService.getAvailableDeliveries(campusIdentifier, req.query);
  return sendSuccess(res, result, 200);
};

const getDelivery = async (req, res) => {
  const roles = getUserRoles(req.user);
  const result = await deliveryService.getDeliveryDetails(req.user.id, roles, req.params.deliveryId);
  return sendSuccess(res, result, 200);
};

const acceptDelivery = async (req, res) => {
  const roles = getUserRoles(req.user);
  const result = await deliveryService.acceptDelivery(req.user.id, roles, req.params.deliveryId);
  return sendSuccess(res, result, 200);
};

const updateDeliveryStatus = async (req, res) => {
  const roles = getUserRoles(req.user);
  const status = req.body.status;
  const result = await deliveryService.updateDeliveryStatus(
    req.user.id,
    roles,
    req.params.deliveryId,
    status,
    req.body
  );
  return sendSuccess(res, result, 200);
};

module.exports = {
  createDelivery,
  getCustomerDeliveries,
  getRiderAssignedDeliveries,
  getAvailableDeliveries,
  getDelivery,
  acceptDelivery,
  updateDeliveryStatus,
};

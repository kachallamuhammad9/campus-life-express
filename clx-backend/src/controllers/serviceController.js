const serviceService = require('../services/serviceService');
const { sendSuccess } = require('../utils/response');

const listServices = async (req, res) => {
  const {
    campusId,
    categoryId,
    search,
    limit,
    offset,
  } = req.query;

  const services = await serviceService.listServices({
    campusId,
    categoryId,
    search,
    limit,
    offset,
  });

  return sendSuccess(res, services);
};

const getService = async (req, res) => {
  const service = await serviceService.getServiceByIdentifier(req.params.serviceId);
  return sendSuccess(res, service);
};

const createServiceRequest = async (req, res) => {
  const serviceRequest = await serviceService.createServiceRequest(
    req.params.serviceId,
    req.body,
    req.user
  );
  return sendSuccess(res, serviceRequest, 201);
};

const getServiceRequest = async (req, res) => {
  const serviceRequest = await serviceService.getServiceRequest(req.params.requestId);
  return sendSuccess(res, serviceRequest);
};

module.exports = {
  listServices,
  getService,
  createServiceRequest,
  getServiceRequest,
};

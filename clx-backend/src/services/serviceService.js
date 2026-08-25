const serviceRepository = require('../repositories/serviceRepository');
const { AppError } = require('../utils/AppError');

const VALID_DELIVERY_TYPES = new Set(['PICKUP', 'DELIVERY', 'IN_PERSON']);

const normalizePagination = (queryLimit, queryOffset, defaultLimit = 20, maxLimit = 100) => {
  const parsedLimit = parseInt(queryLimit, 10);
  const parsedOffset = parseInt(queryOffset, 10);

  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxLimit)
    : defaultLimit;

  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0
    ? parsedOffset
    : 0;

  return { limit, offset };
};

const listServices = async ({
  campusId,
  categoryId,
  search,
  limit,
  offset,
} = {}) => {
  const pagination = normalizePagination(limit, offset, 20, 100);

  return serviceRepository.listServices({
    campusId: campusId ? String(campusId).trim() : undefined,
    categoryId: categoryId ? String(categoryId).trim() : undefined,
    search: search ? String(search).trim() : undefined,
    limit: pagination.limit,
    offset: pagination.offset,
  });
};

const getServiceByIdentifier = async (identifier) => {
  if (!identifier || typeof identifier !== 'string') {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service was not found');
  }

  const service = await serviceRepository.getServiceByIdentifier(identifier.trim());
  if (!service) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service was not found');
  }
  return service;
};

const createServiceRequest = async (serviceIdentifier, requestData = {}, userContext = null) => {
  const service = await getServiceByIdentifier(serviceIdentifier);

  const requesterUserId = userContext?.id
    ? userContext.id
    : (requestData.requesterUserId || requestData.requester_user_id || requestData.userId);

  if (!requesterUserId || typeof requesterUserId !== 'string' || requesterUserId.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'requester_user_id is required');
  }

  const deliveryType = requestData.deliveryType || requestData.delivery_type;
  if (!deliveryType || !VALID_DELIVERY_TYPES.has(deliveryType)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Valid delivery_type is required (PICKUP, DELIVERY, IN_PERSON)'
    );
  }

  const description = requestData.description;
  if (!description || typeof description !== 'string' || description.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'description is required');
  }

  const fileUrl = requestData.fileUrl || requestData.file_url;
  if (service.requires_file_upload && (!fileUrl || typeof fileUrl !== 'string' || fileUrl.trim() === '')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'file_url is required for this service');
  }

  const preferredDate = requestData.preferredDate || requestData.preferred_date;
  if (service.requires_appointment && (!preferredDate || typeof preferredDate !== 'string' || preferredDate.trim() === '')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'preferred_date is required for this appointment service');
  }

  let estimatedBudgetKobo;
  const rawBudget = requestData.estimatedBudgetKobo !== undefined
    ? requestData.estimatedBudgetKobo
    : requestData.estimated_budget_kobo;

  if (rawBudget !== undefined && rawBudget !== null && rawBudget !== '') {
    const parsedBudget = parseInt(rawBudget, 10);
    if (!Number.isInteger(parsedBudget) || parsedBudget < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'estimated_budget_kobo must be a non-negative integer');
    }
    estimatedBudgetKobo = parsedBudget;
  }

  const customerLocation = requestData.customerLocation || requestData.customer_location;
  const preferredTime = requestData.preferredTime || requestData.preferred_time;
  const notes = requestData.notes;

  return serviceRepository.createServiceRequest({
    serviceId: service.id,
    requesterUserId: requesterUserId.trim(),
    providerUserId: service.provider_user_id,
    vendorId: service.vendor_id,
    campusId: service.campus_id,
    deliveryType,
    customerLocation: customerLocation ? String(customerLocation).trim() : null,
    description: description.trim(),
    fileUrl: fileUrl ? String(fileUrl).trim() : null,
    estimatedBudgetKobo,
    preferredDate: preferredDate ? String(preferredDate).trim() : null,
    preferredTime: preferredTime ? String(preferredTime).trim() : null,
    notes: notes ? String(notes).trim() : null,
  });
};

const getServiceRequest = async (requestId) => {
  if (!requestId || typeof requestId !== 'string') {
    throw new AppError(404, 'SERVICE_REQUEST_NOT_FOUND', 'Service request was not found');
  }

  const request = await serviceRepository.getServiceRequestById(requestId.trim());
  if (!request) {
    throw new AppError(404, 'SERVICE_REQUEST_NOT_FOUND', 'Service request was not found');
  }
  return request;
};

module.exports = {
  normalizePagination,
  listServices,
  getServiceByIdentifier,
  createServiceRequest,
  getServiceRequest,
};

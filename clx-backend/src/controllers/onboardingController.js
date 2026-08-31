const onboardingService = require('../services/onboardingService');
const { sendSuccess } = require('../utils/response');

const submitVendorApplication = async (req, res, next) => {
  try {
    const result = await onboardingService.createVendorApplication(req.body || {});
    return sendSuccess(res, result, 201);
  } catch (err) { next(err); }
};

const listVendorApplications = async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query;
    const applications = await onboardingService.listVendorApplications({
      status,
      limit: parseInt(limit, 10) || 20,
      offset: parseInt(offset, 10) || 0,
    });
    return sendSuccess(res, { applications, count: applications.length });
  } catch (err) { next(err); }
};

const reviewVendorApplication = async (req, res, next) => {
  try {
    const result = await onboardingService.reviewVendorApplication(req.params.applicationId, req.body || {}, req.user);
    return sendSuccess(res, result);
  } catch (err) { next(err); }
};

module.exports = {
  submitVendorApplication,
  listVendorApplications,
  reviewVendorApplication,
};

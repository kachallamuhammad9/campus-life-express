const campusService = require('../services/campusService');
const { sendSuccess } = require('../utils/response');

const listCampuses = async (req, res) => {
  const campuses = await campusService.getActiveCampuses();
  return sendSuccess(res, campuses);
};

const getCampus = async (req, res) => {
  const campus = await campusService.getCampusByIdentifier(req.params.campusId);
  return sendSuccess(res, campus);
};

const listDeliveryZones = async (req, res) => {
  const zones = await campusService.getDeliveryZonesByCampus(req.params.campusId);
  return sendSuccess(res, zones);
};

module.exports = {
  listCampuses,
  getCampus,
  listDeliveryZones,
};

const campusRepository = require('../repositories/campusRepository');
const deliveryZoneRepository = require('../repositories/deliveryZoneRepository');
const { AppError } = require('../utils/AppError');

const getActiveCampuses = () => campusRepository.getActiveCampuses();

const getCampusByIdentifier = async (identifier) => {
  const campus = await campusRepository.getCampusByIdentifier(identifier);
  if (!campus) {
    throw new AppError(404, 'CAMPUS_NOT_FOUND', 'Campus was not found');
  }

  return campus;
};

const getDeliveryZonesByCampus = async (identifier) => {
  await getCampusByIdentifier(identifier);
  return deliveryZoneRepository.getActiveDeliveryZonesByCampus(identifier);
};

module.exports = {
  getActiveCampuses,
  getCampusByIdentifier,
  getDeliveryZonesByCampus,
};

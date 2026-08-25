const { AppError } = require('../utils/AppError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_PATTERN.test(value);

const validateUuidParam = (paramName) => (req, res, next) => {
  if (!isUuid(req.params[paramName])) {
    return next(new AppError(
      400,
      'INVALID_UUID',
      `Invalid UUID supplied for ${paramName}`,
      `The ${paramName} must be a valid UUID`
    ));
  }

  return next();
};

module.exports = {
  isUuid,
  validateUuidParam,
};

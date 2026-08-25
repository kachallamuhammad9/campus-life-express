const { AppError } = require('../utils/AppError');

const notFound = (req, res, next) => {
  next(new AppError(
    404,
    'ROUTE_NOT_FOUND',
    `Route not found: ${req.method} ${req.path}`,
    'The requested route was not found'
  ));
};

module.exports = {
  notFound,
};

class AppError extends Error {
  constructor(statusCode, code, message, clientMessage = message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.clientMessage = clientMessage;
    this.isOperational = true;
  }
}

module.exports = {
  AppError,
};

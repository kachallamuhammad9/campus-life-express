const crypto = require('node:crypto');
const config = require('../config/env');
const { AppError } = require('./AppError');

const isConfigured = () => Boolean(config.paystackSecretKey);

const requestPaystack = async (path, options = {}) => {
  if (!isConfigured()) {
    throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Card payments are not configured');
  }

  let response;
  try {
    response = await fetch(`${config.paystackApiBaseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.paystackSecretKey}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new AppError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Card payment service is unavailable');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Card payment service returned an invalid response');
  }

  if (!response.ok || !body.status || !body.data) {
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Card payment service could not process the request');
  }

  return body.data;
};

const initializeTransaction = async ({ email, amountKobo, reference, callbackUrl }) => {
  if (!email) {
    throw new AppError(400, 'PAYMENT_EMAIL_REQUIRED', 'A valid account email is required for card payments');
  }

  return requestPaystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    }),
  });
};

const verifyTransaction = async (reference) => {
  if (!reference) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Payment reference is required');
  }

  return requestPaystack(`/transaction/verify/${encodeURIComponent(reference)}`);
};

const verifyWebhookSignature = (rawBody, signature) => {
  if (!isConfigured() || !rawBody || !signature || typeof signature !== 'string') {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', config.paystackSecretKey)
    .update(rawBody)
    .digest('hex');
  const provided = signature.trim();

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
};

module.exports = {
  isConfigured,
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
};
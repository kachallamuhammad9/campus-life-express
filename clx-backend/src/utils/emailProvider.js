/**
 * Email Provider Abstraction
 * Provider-agnostic interface for transactional emails (order confirmations,
 * delivery updates, service alerts, and marketplace notices).
 * Avoids hardcoding provider credentials and provides safe in-memory fallback/stubbing.
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const config = require('../config/env');

const MAX_EMAIL_LOGS = 100;
const sentEmailsBuffer = [];

/**
 * Validate email address format (RFC 5322 basic subset)
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
};

/**
 * In-Memory Stub Email Provider (Default for dev & test)
 */
const sendStubEmail = async (emailPayload) => {
  const messageId = `msg_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  const record = {
    messageId,
    timestamp,
    to: emailPayload.to,
    from: emailPayload.from || config.emailFrom,
    subject: emailPayload.subject,
    text: emailPayload.text || '',
    html: emailPayload.html || null,
    template: emailPayload.template || null,
    metadata: emailPayload.metadata || {},
    provider: 'stub',
    status: 'DELIVERED_STUB',
  };

  sentEmailsBuffer.unshift(record);
  if (sentEmailsBuffer.length > MAX_EMAIL_LOGS) {
    sentEmailsBuffer.pop();
  }

  if (config.isDevelopment() && config.emailProvider === 'console') {
    console.log(`[EmailProvider:Stub] Sent to ${record.to} | Subject: "${record.subject}"`);
  }

  return {
    success: true,
    messageId,
    to: record.to,
    subject: record.subject,
    provider: 'stub',
    timestamp,
  };
};

/**
 * Custom provider registry for extensibility
 */
const customProviders = new Map();

const isSmtpConfigured = () => Boolean(config.smtpHost && config.smtpUser && config.smtpPass);

const sendSmtpEmail = async (emailPayload) => {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP email provider is not configured');
  }

  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  const result = await transport.sendMail({
    from: emailPayload.from,
    to: emailPayload.to,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html || undefined,
  });

  return {
    success: true,
    messageId: result.messageId,
    to: emailPayload.to,
    subject: emailPayload.subject,
    provider: 'smtp',
  };
};

/**
 * Send Transactional Email
 * @param {Object} params
 * @param {string|string[]} params.to - Recipient email address(es)
 * @param {string} params.subject - Email subject line
 * @param {string} [params.text] - Plain text email body
 * @param {string} [params.html] - HTML email body
 * @param {string} [params.from] - Custom sender address
 * @param {string} [params.template] - Identifier for email template
 * @param {Object} [params.metadata] - Extra tracking metadata
 * @param {boolean} [params.throwOnError=false] - Whether to throw on error
 */
const sendEmail = async ({
  to,
  subject,
  text,
  html,
  from,
  template,
  metadata = {},
  throwOnError = false,
}) => {
  const normalizedTo = Array.isArray(to) ? to.map((t) => String(t).trim()).filter(Boolean) : (to ? [String(to).trim()] : []);

  if (normalizedTo.length === 0 || !normalizedTo.some(isValidEmail)) {
    const err = new Error(`Invalid email recipient: ${to}`);
    if (throwOnError) throw err;
    return {
      success: false,
      error: err.message,
      provider: config.emailProvider,
    };
  }

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    const err = new Error('Email subject is required');
    if (throwOnError) throw err;
    return {
      success: false,
      error: err.message,
      provider: config.emailProvider,
    };
  }

  const payload = {
    to: normalizedTo.length === 1 ? normalizedTo[0] : normalizedTo,
    subject: subject.trim(),
    text: text ? String(text).trim() : '',
    html: html ? String(html).trim() : null,
    from: from ? String(from).trim() : config.emailFrom,
    template: template || null,
    metadata,
  };

  try {
    const providerName = (config.emailProvider || 'stub').toLowerCase();

    if (customProviders.has(providerName)) {
      const customFn = customProviders.get(providerName);
      return await customFn(payload);
    }

    if (providerName === 'smtp') {
      return await sendSmtpEmail(payload);
    }

    // Default to stub provider
    return await sendStubEmail(payload);
  } catch (err) {
    if (throwOnError) {
      throw err;
    }
    return {
      success: false,
      error: err.message,
      provider: config.emailProvider,
    };
  }
};

/**
 * Retrieve sent emails buffer (for testing and debugging)
 */
const getSentEmails = () => [...sentEmailsBuffer];

/**
 * Clear sent emails buffer
 */
const clearSentEmails = () => {
  sentEmailsBuffer.length = 0;
};

/**
 * Register a custom email provider adapter
 */
const registerCustomProvider = (name, providerFn) => {
  if (typeof providerFn !== 'function') {
    throw new TypeError('Custom provider must be a function');
  }
  customProviders.set(String(name).toLowerCase(), providerFn);
};

/**
 * Get current provider status & diagnostics
 */
const getEmailProviderStatus = () => ({
  configuredProvider: config.emailProvider,
  defaultSender: config.emailFrom,
  totalSentBuffered: sentEmailsBuffer.length,
  customProviders: Array.from(customProviders.keys()),
  isStubMode: config.emailProvider === 'stub' || (config.emailProvider !== 'smtp' && !customProviders.has(config.emailProvider)),
  isConfigured: config.emailProvider === 'smtp' ? isSmtpConfigured() : true,
});

module.exports = {
  sendEmail,
  isValidEmail,
  getSentEmails,
  clearSentEmails,
  registerCustomProvider,
  getEmailProviderStatus,
  isSmtpConfigured,
};

/**
 * Environment Configuration
 * Loads and validates environment variables
 */

require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  databaseSslCa: process.env.DATABASE_SSL_CA || null,
  jwtSecret: process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'clx-dev-test-jwt-secret-key-32-chars-dandalin'),
  gasIntegrationKey: process.env.GAS_INTEGRATION_KEY || process.env.APPS_SCRIPT_API_KEY || (process.env.NODE_ENV === 'production' ? undefined : 'clx-dev-gas-secret-key-32-chars-sauki'),
  gasWebhookUrl: process.env.GAS_WEBHOOK_URL || null,
  gasWebhookSecret: process.env.GAS_WEBHOOK_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'clx-dev-gas-webhook-secret-32-chars'),

  // Email Notification Provider Configuration
  emailProvider: process.env.EMAIL_PROVIDER || 'stub',
  emailFrom: process.env.EMAIL_FROM || 'notifications@campuslife.express',
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  smtpUser: process.env.SMTP_USER || null,
  smtpPass: process.env.SMTP_PASS || null,
  smtpSecure: process.env.SMTP_SECURE === 'true',

  // Paystack Configuration
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || null,
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || null,
  paystackApiBaseUrl: process.env.PAYSTACK_API_BASE_URL || 'https://api.paystack.co',

  // API Rate Limiting Configuration
  authRateLimitWindowMs: process.env.AUTH_RATE_LIMIT_WINDOW_MS ? Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) : 15 * 60 * 1000,
  authRateLimitMax: process.env.AUTH_RATE_LIMIT_MAX ? Number(process.env.AUTH_RATE_LIMIT_MAX) : 100,
  orderRateLimitWindowMs: process.env.ORDER_RATE_LIMIT_WINDOW_MS ? Number(process.env.ORDER_RATE_LIMIT_WINDOW_MS) : 10 * 60 * 1000,
  orderRateLimitMax: process.env.ORDER_RATE_LIMIT_MAX ? Number(process.env.ORDER_RATE_LIMIT_MAX) : 60,
  paymentRateLimitWindowMs: process.env.PAYMENT_RATE_LIMIT_WINDOW_MS ? Number(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS) : 10 * 60 * 1000,
  paymentRateLimitMax: process.env.PAYMENT_RATE_LIMIT_MAX ? Number(process.env.PAYMENT_RATE_LIMIT_MAX) : 60,

  isDevelopment: () => config.nodeEnv === 'development',
  isProduction: () => config.nodeEnv === 'production',
  isTest: () => config.nodeEnv === 'test' || process.env.NODE_ENV === 'test',
};

// Validate required environment variables
if (!config.databaseUrl && config.isProduction() && !process.env.BUILD_PHASE && process.env.STRICT_DB_CHECK === 'true') {
  console.error('ERROR: DATABASE_URL environment variable is required in production');
  process.exit(1);
} else if (!config.databaseUrl) {
  if (config.isDevelopment() || config.isProduction()) {
    console.warn('[CONFIG] DATABASE_URL is not set. Running in resilient campus mock/fallback mode.');
  }
}

module.exports = config;

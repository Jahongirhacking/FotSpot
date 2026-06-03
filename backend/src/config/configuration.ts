// src/config/configuration.ts
// Centralized config — all env vars accessed through this, never process.env directly
export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: parseInt(process.env.PORT ?? "3001", 10),
    url: process.env.APP_URL ?? "http://localhost:3001",
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD ?? "",
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "fallback-secret-change-in-prod",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ??
      "fallback-refresh-secret-change-in-prod",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? "300", 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? "3", 10),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? "60", 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? "100", 10),
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME ?? "goalspot-media",
    publicUrl: process.env.R2_PUBLIC_URL,
  },
});

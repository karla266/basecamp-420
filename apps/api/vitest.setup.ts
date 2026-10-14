process.env.QUEUE_MODE = 'inline';
process.env.AUTH_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_FROM_NUMBER;
delete process.env.S3_ENDPOINT;

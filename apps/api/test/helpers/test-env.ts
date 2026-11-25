/**
 * Test environment variable defaults before module imports are evaluated.
 */
process.env.NODE_ENV ??= "test";
process.env["DB_URL"] ??=
  "postgresql://postgres:postgrespassword@localhost:5432/greenroots_farm";
process.env["SHIPPING_DRIVER"] ??= "haversine";
process.env["MEDIA_DRIVER"] ??= "mock";
process.env["CLOUDINARY_CLOUD_NAME"] ??= "test-cloud";
process.env["CLOUDINARY_API_KEY"] ??= "test-api-key";
process.env["CLOUDINARY_API_SECRET"] ??= "test-api-secret-1234567890";
process.env["RESEND_API_KEY"] ??= "re_test_key_for_testing_32_chars";
process.env["EMAIL_FROM"] ??= "GreenRoots Farm <test@greenroots.farm>";

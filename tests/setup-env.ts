import "dotenv/config";

// Las pruebas nunca tocan la base de desarrollo: todo corre contra TEST_DATABASE_URL.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
}

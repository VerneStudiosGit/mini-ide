import dotenv from "dotenv";

const isRailway =
  Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) ||
  Boolean(process.env.RAILWAY_SERVICE_NAME);

dotenv.config({ path: ".env" });

if (!isRailway) {
  dotenv.config({ path: ".env.local", override: true });
}

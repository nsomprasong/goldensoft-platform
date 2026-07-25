import { requireSafeEnvironment } from "../src/lib/env/guard";

try {
  requireSafeEnvironment();
  console.log("Environment guard OK");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

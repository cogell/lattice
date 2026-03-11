import { createApiClient } from "@lattice/shared";
import { getRequiredConfig } from "./config.js";

export function getClient() {
  const config = getRequiredConfig();
  return createApiClient(config.api_url, () => `Bearer ${config.token}`);
}

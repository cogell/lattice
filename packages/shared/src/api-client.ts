/** Stub API client factory — methods added per phase. */
export function createApiClient(
  baseUrl: string,
  getAuthHeader: () => string,
) {
  const headers = () => ({
    Authorization: getAuthHeader(),
    "Content-Type": "application/json",
  });
  return { _baseUrl: baseUrl, _headers: headers };
}

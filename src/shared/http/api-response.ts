export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
}

export function okResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, data, message };
}

export function failResponse(
  message: string,
  data: unknown = null,
): ApiResponse {
  return { success: false, data, message };
}

export function isApiEnvelope(payload: unknown): payload is ApiResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.success === 'boolean' &&
    'data' in obj &&
    typeof obj.message === 'string'
  );
}

export function defaultSuccessMessage(statusCode: number): string {
  if (statusCode === 201) return 'Created';
  if (statusCode === 204) return 'Success';
  return 'Success';
}

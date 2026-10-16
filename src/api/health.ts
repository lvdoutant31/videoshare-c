export interface HealthResponse {
  data: {
    service: string;
    status: string;
  };
}

export async function getHealth(baseUrl: string, path: string): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error('Health check failed');
  return response.json() as Promise<HealthResponse>;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;


export default async function fetchHTTPClient<T>(
  endpoint: string,
  request: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...request,
    headers: {
      "Content-Type": "application/json",
      ...request.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(
      errorBody.error || `HTTP error! Status: ${response.status}`
    );
  }

  if (response.status == 204) {
    return null as T;
  }

  return response.json();
}

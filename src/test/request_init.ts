export function getRequestBodyString(init?: RequestInit): string {
  if (typeof init?.body !== "string") {
    throw new TypeError("Expected RequestInit.body to be a string");
  }

  return init.body;
}

export function parseRequestBodyJson<T>(init?: RequestInit): T {
  return JSON.parse(getRequestBodyString(init)) as T;
}

let configured = false;

export function isDeviceConfigured() {
  return configured;
}

export function markDeviceConfigured() {
  configured = true;
}

import { Redirect } from "expo-router";
import { isDeviceConfigured } from "../src/state/device";

export default function IndexScreen() {
  const configured = isDeviceConfigured();

  if (configured) {
    return <Redirect href="/unlock" />;
  }

  return <Redirect href="/setup" />;
}

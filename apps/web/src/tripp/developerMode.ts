import * as Schema from "effect/Schema";

import { useLocalStorage } from "../hooks/useLocalStorage";

/** Developer mode shows T3 Code's full project and thread sidebar instead of the Bot roster. */
const DEVELOPER_MODE_STORAGE_KEY = "tripp:developer-mode";

export function useDeveloperMode(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useLocalStorage(DEVELOPER_MODE_STORAGE_KEY, false, Schema.Boolean);
  return [enabled, setEnabled];
}

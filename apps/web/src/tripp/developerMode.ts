import * as Schema from "effect/Schema";

import { getLocalStorageItem, useLocalStorage } from "../hooks/useLocalStorage";

/** Developer mode shows T3 Code's full project and thread sidebar instead of the Bot roster. */
const DEVELOPER_MODE_STORAGE_KEY = "tripp:developer-mode";

export function useDeveloperMode(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useLocalStorage(DEVELOPER_MODE_STORAGE_KEY, false, Schema.Boolean);
  return [enabled, setEnabled];
}

/** Non-hook reader for code that runs outside React, such as the server welcome handler. */
export function readDeveloperMode(): boolean {
  return getLocalStorageItem(DEVELOPER_MODE_STORAGE_KEY, Schema.Boolean) ?? false;
}

import * as Schema from "effect/Schema";

import { useLocalStorage } from "../hooks/useLocalStorage";

/** The primary Bot is the one the home screen opens. Stored per browser as `environmentId:projectId`. */
const PRIMARY_BOT_STORAGE_KEY = "tripp:primary-bot";

export function usePrimaryBotKey(): [string | null, (value: string | null) => void] {
  // An empty string means no primary Bot; the storage codec stays a plain string.
  const [key, setKey] = useLocalStorage(PRIMARY_BOT_STORAGE_KEY, "", Schema.String);
  return [key === "" ? null : key, (value) => setKey(value ?? "")];
}

export function botKey(bot: { readonly environmentId: string; readonly id: string }): string {
  return `${bot.environmentId}:${bot.id}`;
}

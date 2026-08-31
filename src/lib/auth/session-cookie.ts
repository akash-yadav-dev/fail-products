import { sessionCookieConfig } from "@/lib/config/auth";

const config = sessionCookieConfig();
export const SESSION_COOKIE = config.name;
export const SESSION_COOKIE_OPTIONS = config.options;

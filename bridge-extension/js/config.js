// Bridge extension configuration.
//
// Loaded into the service worker via importScripts("config.js") from
// background.js. These are the ONLY backend coordinates the extension holds:
// the public API base and the client API key. No provider secrets, FX keys,
// or card credentials ever live here — those stay server-side.
//
// BRIDGE_API_KEY must exactly match the backend's `.env` API_KEY.
const BRIDGE_API_BASE = "http://localhost:4000";
const BRIDGE_API_KEY = "bridge_dev_key_change_me"; // must match backend .env API_KEY

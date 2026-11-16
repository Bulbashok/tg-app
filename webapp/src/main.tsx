import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted faces: identical rendering on Android/iOS/desktop instead of
// Roboto/SF/Segoe drift. Subsetted woff2 with unicode-range (latin+cyrillic).
import "@fontsource-variable/inter";
import "@fontsource/source-serif-4/600.css";
import App from "./App";
import { applyTelegramTheme } from "./lib/telegram";
import "./styles/main.scss";

// Flip our CSS tokens with the Telegram chat theme (light/dark).
applyTelegramTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

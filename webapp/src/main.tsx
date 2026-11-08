import React from "react";
import ReactDOM from "react-dom/client";
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

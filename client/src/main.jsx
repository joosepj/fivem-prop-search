import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ReviewPage from "./ReviewPage.jsx";
import AdminPage from "./AdminPage.jsx";
import "./index.css";

const path = window.location.pathname;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {path === "/review" ? <ReviewPage /> : path === "/admin" ? <AdminPage /> : <App />}
  </StrictMode>
);

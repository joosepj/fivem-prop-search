import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ReviewPage from "./ReviewPage.jsx";
import "./index.css";

const isReview = window.location.pathname === "/review";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isReview ? <ReviewPage /> : <App />}
  </StrictMode>
);

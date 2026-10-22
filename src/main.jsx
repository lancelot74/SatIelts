import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import "@fontsource-variable/manrope";
import App from "./App.jsx";
import "./styles.css";

const CANONICAL_ORIGIN = "https://eightsteppe.org";

function CanonicalLink() {
  const { pathname } = useLocation();
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${CANONICAL_ORIGIN}${pathname}`;
  }, [pathname]);
  return null;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <CanonicalLink />
    <App />
  </BrowserRouter>,
);

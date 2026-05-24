import React from "react";
import ReactDOM from "react-dom/client";
import * as pdfjsLib from "pdfjs-dist";
import App from "./App";
import "./index.css";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

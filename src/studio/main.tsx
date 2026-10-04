import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./studio.css";

const root = document.getElementById("root");
if (!root) throw new Error("Studio root not found");

// No StrictMode: it would mount the WebGL engine twice on one canvas in development.
createRoot(root).render(<App />);

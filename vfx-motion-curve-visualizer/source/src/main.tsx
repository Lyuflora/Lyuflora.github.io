import { createRoot } from "react-dom/client";
import App from "./App";
import { useState } from "react";
import BlendStudio from "./BlendStudio";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "./styles.css";
import "./studio.css";
function Root() {
  const [legacy, setLegacy] = useState(false);
  return legacy ? (
    <>
      <App />
      <button className="return-to-blend" onClick={() => setLegacy(false)}>
        Open trajectory & blend editor
      </button>
    </>
  ) : (
    <BlendStudio legacy={() => setLegacy(true)} />
  );
}
createRoot(document.getElementById("root")!).render(<Root />);

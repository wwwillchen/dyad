from dyad_app.web_components.sandpack import sandpack


def react_sandpack(app_code: str):
    sandpack(
        entry="index.js",
        files={
            "index.js": {
                "code": """import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
document.body.style.backgroundColor = "white";

const style = document.createElement("style");    
style.innerHTML = `
@media (pointer: fine) {
  @supports not (selector(::-webkit-scrollbar)) {
    * {
      scrollbar-color: #dadce0 transparent;
      scrollbar-gutter: auto;
      scrollbar-width: thin;
    }
  }

  ::-webkit-scrollbar,
  ::-webkit-scrollbar-corner {
    background: transparent;
    height: 12px;
    width: 12px;
  }

  ::-webkit-scrollbar-thumb {
    background: content-box currentColor;
    border: 2px solid transparent;
    border-radius: 8px;
    color: #dadce0;
    min-height: 48px;
    min-width: 48px;
  }

  :hover::-webkit-scrollbar-thumb {
    color: #80868b;
  }

  ::-webkit-scrollbar-thumb:active {
    color: #5f6368;
  }

  ::-webkit-scrollbar-button {
    height: 0;
    width: 0;
  }
}
`;
document.head.appendChild(style);
const scriptElement = document.createElement("script");
scriptElement.src = "https://cdn.tailwindcss.com";
document.body.appendChild(scriptElement);
const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

                    """
            },
            "App.js": {
                "code": app_code,
            },
        },
        dependencies={
            "react": "19.0.0",
            "react-dom": "19.0.0",
            "react-scripts": "5.0.0",
        },
    )

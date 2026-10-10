import "./style.css";

import { bootAccent } from "@stasher/ui/lib/accent-boot";
import ReactDOM from "react-dom/client";

import { App } from "./App";

bootAccent();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

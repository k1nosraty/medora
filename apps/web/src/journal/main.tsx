import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./style.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { networkMode: "always", retry: false, staleTime: 10000 },
    mutations: { networkMode: "always", retry: false },
  },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <HashRouter>
      <App />
    </HashRouter>
  </QueryClientProvider>,
);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .catch(() => {});
  });

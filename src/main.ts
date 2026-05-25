import { createApp } from "vue";
import App from "./App.vue";
import { initializePersistentChatRuntime } from "./persistence/persistenceBootstrap";
import { router } from "./router";
import { pinia } from "./stores";
import "./styles/index.css";

async function bootstrapApp() {
  try {
    await initializePersistentChatRuntime();
  } catch {
    // The app can still run with in-memory stores when persistence is blocked.
  }

  createApp(App).use(pinia).use(router).mount("#app");
}

void bootstrapApp();

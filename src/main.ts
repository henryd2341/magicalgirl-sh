import { createApp } from "vue";
import App from "./App.vue";
import { initializePersistentChatRuntime } from "./persistence/persistenceBootstrap";
import { router } from "./router";
import { pinia } from "./stores";
import { skillRegistry } from "./orchestrator/skillRegistry";
import { useSkillStore } from "./stores/skillStore";
import "./styles/index.css";

const builtinSkillModules = import.meta.glob<string>(
  "./content/agentSkills/**/SKILL.md",
  { query: "?raw", import: "default", eager: true },
);

async function bootstrapApp() {
  skillRegistry.loadBuiltinSkills(builtinSkillModules);

  try {
    await initializePersistentChatRuntime();
  } catch {
    // The app can still run with in-memory stores when persistence is blocked.
  }

  const app = createApp(App).use(pinia).use(router);
  useSkillStore().loadSkills();
  app.mount("#app");
}

void bootstrapApp();

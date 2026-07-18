import { createApp } from "vue";
import App from "./App.vue";
import { initializePersistentChatRuntime } from "./persistence/persistenceBootstrap";
import { router } from "./router";
import { pinia } from "./stores";
import { skillRegistry } from "./orchestrator/skillRegistry";
import { useSkillStore } from "./stores/skillStore";
import { registerChallengeBossProfiles } from "./engine/battle/boss/profiles/registerChallengeBossProfiles";
import { handleHiddenChallengeDownload } from "./app/hiddenChallengeDownload";
import "./styles/index.scss";
import "./styles/tailwind.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

handleHiddenChallengeDownload();

// Initialize theme from localStorage (default: e-girl)
const savedTheme = localStorage.getItem("mg-theme") || "e-girl";
document.documentElement.dataset.theme = savedTheme;

const builtinSkillModules = import.meta.glob<string>(
  "./content/agentSkills/**/SKILL.md",
  { query: "?raw", import: "default", eager: true },
);

async function bootstrapApp() {
  registerChallengeBossProfiles();
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

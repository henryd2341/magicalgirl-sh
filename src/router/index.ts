import AppShell from "@/app/AppShell.vue";
import MainGameView from "@/pages/MainGameView.vue";
import NewGameSetupView from "@/pages/NewGameSetupView.vue";
import SaveExportView from "@/pages/SaveExportView.vue";
import SettingsView from "@/pages/SettingsView.vue";
import SplashScreenView from "@/pages/SplashScreenView.vue";
import StartScreenView from "@/pages/StartScreenView.vue";
import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: AppShell,
      children: [
        { path: "", name: "start", component: StartScreenView },
        { path: "title", name: "title", component: SplashScreenView },
        { path: "new-game", name: "new-game", component: NewGameSetupView },
        { path: "game", name: "game", component: MainGameView },
        { path: "settings", name: "settings", component: SettingsView },
        { path: "save-export", name: "save-export", component: SaveExportView },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0, behavior: "smooth" };
  },
});

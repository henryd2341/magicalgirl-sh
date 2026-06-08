import AppShell from "@/app/AppShell.vue";
import MainGameView from "@/pages/MainGameView.vue";
import NewGameSetupView from "@/pages/NewGameSetupView.vue";
import SplashScreenView from "@/pages/SplashScreenView.vue";
import StartScreenView from "@/pages/StartScreenView.vue";
import { createRouter, createMemoryHistory } from "vue-router";

// Settings, API Settings, and Save Management are now modals — routes removed.
// Only 4 main views remain: start, title, new-game, game.

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: "/",
      component: AppShell,
      children: [
        { path: "", name: "start", component: StartScreenView },
        { path: "title", name: "title", component: SplashScreenView },
        { path: "new-game", name: "new-game", component: NewGameSetupView },
        { path: "game", name: "game", component: MainGameView },
      ],
    },
  ],
});

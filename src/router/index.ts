import AppShell from "@/app/AppShell.vue";
import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: AppShell,
    },
  ],
  scrollBehavior() {
    return { top: 0, behavior: "smooth" };
  },
});

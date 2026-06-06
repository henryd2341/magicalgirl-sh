import { ref, onMounted, onUnmounted } from "vue";

type ThemeDeco = {
  statusEmoji: string;
  chatKaomoji: string;
  splashKaomoji: string[];
};

const E_GIRL: ThemeDeco = {
  statusEmoji: "(>_<)",
  chatKaomoji: "(>_<)",
  splashKaomoji: ["★", "(>_<)", "♡", "✧", "(^_^)", "♡", "☆", "(/_\\ )", "♡"],
};

const KIDCORE: ThemeDeco = {
  statusEmoji: "",
  chatKaomoji: "",
  splashKaomoji: [],
};

const PASTEL: ThemeDeco = {
  statusEmoji: "",
  chatKaomoji: "",
  splashKaomoji: [],
};

const THEME_MAP: Record<string, ThemeDeco> = {
  "e-girl": E_GIRL,
  kidcore: KIDCORE,
  "pastel-brutalism": PASTEL,
};

function resolveDeco(): ThemeDeco {
  const theme = document.documentElement.dataset.theme || "e-girl";
  return THEME_MAP[theme] || E_GIRL;
}

export function useThemeDeco() {
  const deco = ref<ThemeDeco>(resolveDeco());

  function onThemeChange(e: Event) {
    const theme = (e as CustomEvent<{ theme: string }>).detail?.theme || "e-girl";
    deco.value = THEME_MAP[theme] || E_GIRL;
  }

  onMounted(() => {
    window.addEventListener("mg-theme-change", onThemeChange);
  });

  onUnmounted(() => {
    window.removeEventListener("mg-theme-change", onThemeChange);
  });

  return { deco, E_GIRL, KIDCORE, PASTEL };
}

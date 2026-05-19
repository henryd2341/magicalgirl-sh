<script setup lang="ts">
interface NotificationItem {
  id: string;
  tone: "info" | "success" | "warning";
  badge: string;
  title: string;
  body: string;
}

const notifications: NotificationItem[] = [
  {
    id: "notice-prototype-phase",
    tone: "warning",
    badge: "ALPHA SIGNAL",
    title: "原型验证阶段",
    body: "当前版本专注于高保真前端骨架、结构语义化与状态体验打磨，后续模块会继续填充数据库、状态机与战斗闭环。",
  },
  {
    id: "notice-visual-shell",
    tone: "success",
    badge: "VISUAL CORE",
    title: "高规格视觉骨架已加载",
    body: "已启用霓虹玻璃、果冻触感按钮、动态光晕、精细排版与内部通知系统，作为后续剧情与战斗界面的视觉母板。",
  },
  {
    id: "notice-local-feedback",
    tone: "info",
    badge: "UX PROMISE",
    title: "内部反馈优先",
    body: "系统将以内建横幅、卡片提示与通知中心承担反馈职责，不依赖浏览器原生弹窗。",
  },
];
</script>

<template>
  <section
    id="system-notification-center"
    class="notification-center glass-panel"
    aria-label="系统通知中心"
    role="region"
  >
    <header class="section-heading">
      <p class="eyebrow">Signal Relay</p>
      <h2 id="heading-notification-center">系统通知中心</h2>
    </header>

    <ul class="notification-list" aria-labelledby="heading-notification-center">
      <li
        v-for="item in notifications"
        :id="item.id"
        :key="item.id"
        class="notification-card"
        :data-tone="item.tone"
      >
        <div class="notification-card__meta">
          <span class="status-pill">{{ item.badge }}</span>
          <span class="notification-card__glow" aria-hidden="true"></span>
        </div>
        <div class="notification-card__content">
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<template>
  <section
    id="game-status-banner"
    class="game-status-banner mg-checkerboard"
    aria-label="游戏状态提示"
  >
    <div class="mg-status__inner">
      <span class="mg-status__emoji" aria-hidden="true">(>_<)</span>
      <span class="mg-status__text mg-display-text">当前状态：IDLE</span>
      <span class="mg-status__sub">等待玩家输入...</span>
      <div class="mg-status__pulse" aria-hidden="true"></div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.mg-status__inner {
  display: flex;
  align-items: center;
  gap: var(--mg-space-md);
  position: relative;
  padding: var(--mg-space-md) var(--mg-space-lg);
}

.mg-status__emoji {
  font-size: 1.5rem;
  animation: mg-bounce 2s ease-in-out infinite;
}

.mg-status__text {
  font-size: var(--mg-font-lg);
}

.mg-status__sub {
  font-size: var(--mg-font-sm);
  color: var(--mg-text-secondary);
  opacity: 0.8;
}

.mg-status__pulse {
  position: absolute;
  inset: 0;
  border-radius: var(--mg-radius);
  box-shadow: var(--mg-glow-pink);
  animation: mg-pulse-glow 2s ease-in-out infinite;
  pointer-events: none;
}
</style>

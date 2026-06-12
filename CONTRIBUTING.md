<div align="center">

<img src="public/logo.png" alt="MagicalGirl SH" width="120" />

# ✦ Contributing to MagicalGirl SH ✦

**Glad to have you here, future contributor!**

</div>

```
  ╭──────────────────────────────────────────────╮
  │   ∧＿∧                                      │
  │  ( 🎀ω🎀)  ✦ ようこそ · Welcome ✦            │
  │  ( 丿 ノ    Let's build something magical    │
  │  しーJ                                      │
  ╰──────────────────────────────────────────────╯
```

---

## 📜 Code of Conduct

Be kind. Be constructive. JRPGs are about camaraderie — so is this repo.

---

## 🚦 Before You Start

> [!IMPORTANT]
> **`raw_entries/` is a frozen directory.** It contains creative writing content that is no longer open for contribution. Please do not modify files within it.

For all other areas — code, UI, battle engine, AI orchestration — we're thrilled to have your help.

### ✅ Good First Issues

Look for issues tagged [`good first issue`](https://github.com/henryd2341/magicalgirl-sh/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — they're curated for newcomers.

---

## 🛠 Development Setup

```bash
# 1. Fork & clone
git clone https://github.com/YOUR_USERNAME/magicalgirl-sh.git
cd magicalgirl-sh

# 2. Install deps (pnpm required)
pnpm install

# 3. Start dev server (hot-reload on localhost)
pnpm dev

# 4. Run the test suite
pnpm test

# 5. Lint before committing
pnpm lint
```

| Tool | Purpose |
|---|---|
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Production build (type-check + bundle) |
| `pnpm test` | Vitest unit/component tests |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm lint` | ESLint across all source files |

---

## 🌿 Branch Workflow

```
main          # Production — always green, always deployable
└── feat/foo  # Feature branches — one per PR
└── fix/bar   # Bugfix branches
└── chore/... # Dependency bumps, tooling, etc.
```

### Step-by-step

```bash
# 1. Sync your fork
git checkout main
git pull upstream main

# 2. Create a feature branch
git checkout -b feat/my-awesome-feature

# 3. Write code, commit often
git add src/engine/new-mechanic.ts
git commit -m "feat(battle): add Charge status effect"

# 4. Push & open a PR
git push origin feat/my-awesome-feature
```

---

## ✍️ Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

| Type | When |
|---|---|
| `feat` | New feature or mechanic |
| `fix` | Bug fix |
| `refactor` | Code restructure, no behavior change |
| `style` | CSS / SCSS / visual tweaks |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, deps, tooling |

**Examples:**
```
feat(battle): implement Repel affinity counter
fix(orchestrator): resolve duplicate tool call on retry
style(theme): adjust Kidcore card border-radius
refactor(engine): extract damage formula into pure function
```

---

## 🧪 Testing

- **New features require tests.** Use Vitest for logic, Testing Library for components, Playwright for E2E flows.
- Run `pnpm test` before pushing — a red CI wastes everyone's time.
- Battle engine changes must include edge-case coverage (status interactions, turn order, affinity corner cases).

---

## 🔍 Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary (with a comment explaining why)
- **Vue Composition API** with `<script setup lang="ts">` — no Options API
- **Pinia** for state management — no prop drilling across more than 2 levels
- **Prettier** formatting is enforced; run it before commit
- Keep AI orchestrator changes **backwards-compatible** with the existing tool call schema

```
  ╭──────────────────────────────────────────────╮
  │   ∧＿∧                                      │
  │  ( ✨ω✨)  ✦ PRの流れ · PR Flow ✦            │
  │  ( 丿 丿                                    │
  │  しーJ                                      │
  ╰──────────────────────────────────────────────╯
```

1. **Open a Draft PR** early if you want feedback on your approach
2. **Link related issues** in the PR description (`Closes #42`)
3. **Keep PRs focused** — one feature or fix per PR; split large changes
4. **Include screenshots/videos** for UI changes
5. **Ensure CI is green** — type-check, lint, and tests must all pass
6. **Request review** from a maintainer when ready

### Review Checklist

Before marking your PR as ready:

- [ ] `pnpm build` passes (vue-tsc + vite)
- [ ] `pnpm test` is green
- [ ] `pnpm lint` is clean
- [ ] New code has appropriate test coverage
- [ ] No changes to `raw_entries/`
- [ ] Commit history is clean (squash WIP commits)

---

## 🗺 Project Structure (Key Areas)

```
src/
├── orchestrator/       # AI prompt construction & tool execution
│   ├── promptBuilder.ts
│   └── harnessTools.ts
├── engine/battle/      # Press Turn combat engine
│   ├── damage.ts       # Damage formula
│   ├── affinities.ts   # Elemental affinity logic
│   ├── status.ts       # Status effect system
│   └── turnQueue.ts    # Turn ordering
├── components/         # Vue SFCs (chat, battle, HUD, menus)
├── stores/             # Pinia stores
├── workers/            # SQLite WASM Web Worker
└── data/               # JSONL world info / lorebook
```

---

## 🙋 Need Help?

- **Questions?** Open a [Discussion](https://github.com/henryd2341/magicalgirl-sh/discussions)
- **Bug?** Open an [Issue](https://github.com/henryd2341/magicalgirl-sh/issues) with repro steps
- **PR stuck?** @mention a maintainer in the PR comments

---

<div align="center">

```
  ╭──────────────────────────────────────────────╮
  │   ∧＿∧                                      │
  │  ( ᴗ͈ωᴗ͈)  ✦ ありがとう · Thank You ✦        │
  │  ( 丿 ノ    Every contribution counts <3     │
  │  しーJ                                      │
  ╰──────────────────────────────────────────────╯
```

Made with love & JRPG spirit

</div>

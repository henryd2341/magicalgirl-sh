<script setup lang="ts">
import { useSkillStore } from "@/stores/skillStore";
import { ref } from "vue";

const store = useSkillStore();

const showForm = ref(false);
const editingId = ref<string | null>(null);
const formName = ref("");
const formDescription = ref("");
const formContent = ref("");
const viewingSkillId = ref<string | null>(null);

function openCreateForm() {
  editingId.value = null;
  formName.value = "";
  formDescription.value = "";
  formContent.value = "";
  showForm.value = true;
}

function openEditForm(id: string) {
  const skill = store.skills.find((s) => s.id === id);
  if (!skill || skill.source === "builtin") return;

  editingId.value = id;
  formName.value = skill.name;
  formDescription.value = skill.description;
  formContent.value = skill.content;
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
}

function submitForm() {
  if (
    !formName.value.trim() ||
    !formDescription.value.trim() ||
    !formContent.value.trim()
  )
    return;

  if (editingId.value) {
    store.updateSkill(editingId.value, {
      name: formName.value.trim(),
      description: formDescription.value.trim(),
      content: formContent.value.trim(),
    });
  } else {
    store.createSkill({
      name: formName.value.trim(),
      description: formDescription.value.trim(),
      content: formContent.value.trim(),
    });
  }

  cancelForm();
}

function toggleViewContent(id: string) {
  viewingSkillId.value = viewingSkillId.value === id ? null : id;
}
</script>

<template>
  <section class="skill-settings">
    <div class="skill-settings__header">
      <h2 class="settings-view__subheading">技能管理</h2>
      <button class="primary-cta" type="button" @click="openCreateForm">
        新增技能
      </button>
    </div>

    <div
      v-if="showForm"
      class="skill-settings__form"
      aria-label="技能编辑表单"
    >
      <label class="chat-input-box__label" for="skill-form-name">
        技能名称
        <input
          id="skill-form-name"
          v-model="formName"
          class="settings-view__text-input"
          type="text"
          maxlength="100"
          placeholder="例如：日常风格"
        />
      </label>
      <label class="chat-input-box__label" for="skill-form-desc">
        技能描述
        <input
          id="skill-form-desc"
          v-model="formDescription"
          class="settings-view__text-input"
          type="text"
          maxlength="500"
          placeholder="例如：平静的日常生活叙事，聚焦人际关系"
        />
      </label>
      <label class="chat-input-box__label" for="skill-form-content">
        技能内容（Markdown）
        <textarea
          id="skill-form-content"
          v-model="formContent"
          class="settings-view__textarea"
          rows="8"
          maxlength="50000"
          placeholder="输入 AI 将读取的完整技能指令..."
        />
      </label>
      <div class="skill-settings__form-actions">
        <button class="primary-cta" type="button" @click="submitForm">
          {{ editingId ? "保存修改" : "创建技能" }}
        </button>
        <button class="secondary-cta" type="button" @click="cancelForm">
          取消
        </button>
      </div>
    </div>

    <p v-if="store.skills.length === 0" class="settings-view__empty">
      当前没有技能。点击「新增技能」创建您的第一个自定义技能。
    </p>

    <article
      v-for="skill in store.skills"
      :key="skill.id"
      class="skill-settings__item"
      :class="{ 'skill-settings__item--builtin': skill.source === 'builtin' }"
    >
      <div class="skill-settings__item-info">
        <div class="skill-settings__item-name">
          <strong>{{ skill.name }}</strong>
          <span v-if="skill.source === 'builtin'" class="skill-settings__badge">
            内置
          </span>
        </div>
        <p class="skill-settings__item-desc">{{ skill.description }}</p>
        <div
          v-if="viewingSkillId === skill.id"
          class="skill-settings__item-content"
          aria-label="技能正文"
        >
          <pre class="skill-settings__content-text">{{ skill.content }}</pre>
        </div>
      </div>
      <div class="skill-settings__item-actions">
        <label class="chat-input-box__label settings-view__checkbox-label">
          <input
            type="checkbox"
            :checked="skill.enabled"
            @change="store.toggleSkill(skill.id)"
          />
          启用
        </label>
        <button
          class="secondary-cta"
          type="button"
          @click="toggleViewContent(skill.id)"
        >
          {{ viewingSkillId === skill.id ? "收起正文" : "查看正文" }}
        </button>
        <button
          v-if="skill.source === 'user'"
          class="secondary-cta"
          type="button"
          @click="openEditForm(skill.id)"
        >
          编辑
        </button>
        <button
          v-if="skill.source === 'user'"
          class="secondary-cta"
          type="button"
          @click="store.deleteSkill(skill.id)"
        >
          删除
        </button>
      </div>
    </article>
  </section>
</template>

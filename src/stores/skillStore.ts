import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  skillRegistry,
  type Skill,
  type SkillMetadata,
} from "@/orchestrator/skillRegistry";

export const useSkillStore = defineStore("skill", () => {
  const skills = ref<Skill[]>([]);
  const isLoading = ref(false);

  const enabledSkills = computed(() =>
    skills.value.filter((s) => s.enabled),
  );

  const enabledMetadata = computed<SkillMetadata[]>(() =>
    enabledSkills.value.map((s) => ({
      name: s.name,
      description: s.description,
    })),
  );

  const builtInSkills = computed(() =>
    skills.value.filter((s) => s.source === "builtin"),
  );

  const userSkills = computed(() =>
    skills.value.filter((s) => s.source === "user"),
  );

  function loadSkills(): void {
    isLoading.value = true;
    skillRegistry.loadUserSkills();
    skills.value = skillRegistry.getAllSkills();
    isLoading.value = false;
  }

  function setBuiltinModules(rawModules: Record<string, string>): void {
    skillRegistry.loadBuiltinSkills(rawModules);
    skills.value = skillRegistry.getAllSkills();
  }

  function toggleSkill(id: string): void {
    skillRegistry.setEnabled(id, !skills.value.find((s) => s.id === id)?.enabled);
    skills.value = skillRegistry.getAllSkills();
  }

  function createSkill(data: {
    name: string;
    description: string;
    content: string;
  }): Skill | null {
    const skill = skillRegistry.addUserSkill(data);
    skills.value = skillRegistry.getAllSkills();
    return skill;
  }

  function updateSkill(
    id: string,
    data: { name?: string; description?: string; content?: string },
  ): boolean {
    const result = skillRegistry.updateUserSkill(id, data);
    if (result) {
      skills.value = skillRegistry.getAllSkills();
      return true;
    }
    return false;
  }

  function deleteSkill(id: string): boolean {
    const result = skillRegistry.deleteUserSkill(id);
    if (result) {
      skills.value = skillRegistry.getAllSkills();
      return true;
    }
    return false;
  }

  return {
    skills,
    isLoading,
    enabledSkills,
    enabledMetadata,
    builtInSkills,
    userSkills,
    loadSkills,
    setBuiltinModules,
    toggleSkill,
    createSkill,
    updateSkill,
    deleteSkill,
  };
});

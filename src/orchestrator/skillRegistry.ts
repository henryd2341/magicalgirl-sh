import { z } from "zod";

const USER_SKILLS_STORAGE_KEY = "magicalgirl-sh.user-skills.v1";
const DISABLED_BUILTIN_IDS_KEY = "magicalgirl-sh.disabled-builtin-skills.v1";

const userSkillRecordSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  enabled: z.boolean(),
  createdAt: z.string().min(1).max(100),
  updatedAt: z.string().min(1).max(100),
});

const userSkillRecordsSchema = z.array(userSkillRecordSchema);

export interface SkillMetadata {
  name: string;
  description: string;
}

export interface Skill extends SkillMetadata {
  id: string;
  content: string;
  source: "builtin" | "user";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserSkillRecord {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function parseFrontmatter(raw: string): { metadata: SkillMetadata; body: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) return null;

  const secondDelim = trimmed.indexOf("---", 3);
  if (secondDelim === -1) return null;

  const frontmatterBlock = trimmed.slice(3, secondDelim).trim();
  const body = trimmed.slice(secondDelim + 3).trim();

  const nameMatch = frontmatterBlock.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatterBlock.match(/^description:\s*(.+)$/m);

  if (!nameMatch || !descMatch) return null;

  return {
    metadata: {
      name: nameMatch[1].trim(),
      description: descMatch[1].trim(),
    },
    body,
  };
}

function generateId(name: string, source: "builtin" | "user"): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${source}-${slug}`;
}

function loadDisabledBuiltinIds(): Set<string> {
  try {
    const stored = globalThis.localStorage?.getItem(DISABLED_BUILTIN_IDS_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return new Set(parsed);
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function saveDisabledBuiltinIds(ids: Set<string>): void {
  globalThis.localStorage?.setItem(
    DISABLED_BUILTIN_IDS_KEY,
    JSON.stringify([...ids]),
  );
}

export class SkillRegistry {
  private builtinSkills: Skill[] = [];
  private userSkills: Skill[] = [];

  public loadBuiltinSkills(rawModules: Record<string, string>): void {
    const disabledIds = loadDisabledBuiltinIds();
    this.builtinSkills = [];

    for (const [, rawContent] of Object.entries(rawModules)) {
      const parsed = parseFrontmatter(rawContent);
      if (!parsed) continue;

      const id = generateId(parsed.metadata.name, "builtin");

      const skill: Skill = {
        id,
        name: parsed.metadata.name,
        description: parsed.metadata.description,
        content: parsed.body,
        source: "builtin",
        enabled: !disabledIds.has(id),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.builtinSkills.push(skill);
    }
  }

  public loadUserSkills(): void {
    try {
      const stored = globalThis.localStorage?.getItem(USER_SKILLS_STORAGE_KEY);
      if (!stored) {
        this.userSkills = [];
        return;
      }

      const raw = JSON.parse(stored);
      const parsed = userSkillRecordsSchema.safeParse(raw);

      if (!parsed.success) {
        this.userSkills = [];
        return;
      }

      this.userSkills = parsed.data.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        content: r.content,
        source: "user" as const,
        enabled: r.enabled,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch {
      this.userSkills = [];
    }
  }

  public saveUserSkills(): void {
    const records: UserSkillRecord[] = this.userSkills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      content: s.content,
      enabled: s.enabled,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    globalThis.localStorage?.setItem(
      USER_SKILLS_STORAGE_KEY,
      JSON.stringify(records),
    );
  }

  public getAllSkills(): Skill[] {
    const userSkillNames = new Set(
      this.userSkills.map((s) => s.name.toLowerCase()),
    );

    const filteredBuiltins = this.builtinSkills.filter(
      (s) => !userSkillNames.has(s.name.toLowerCase()),
    );

    return [...filteredBuiltins, ...this.userSkills];
  }

  public getEnabledMetadata(): SkillMetadata[] {
    return this.getAllSkills()
      .filter((s) => s.enabled)
      .map((s) => ({ name: s.name, description: s.description }));
  }

  public getByName(name: string): Skill | null {
    const all = this.getAllSkills();
    return (
      all.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null
    );
  }

  public getUserSkills(): Skill[] {
    return [...this.userSkills];
  }

  public addUserSkill(data: {
    name: string;
    description: string;
    content: string;
  }): Skill {
    const now = new Date().toISOString();
    const skill: Skill = {
      id: generateId(data.name, "user"),
      name: data.name,
      description: data.description,
      content: data.content,
      source: "user",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    this.userSkills.push(skill);
    this.saveUserSkills();
    return skill;
  }

  public updateUserSkill(
    id: string,
    data: { name?: string; description?: string; content?: string },
  ): Skill | null {
    const index = this.userSkills.findIndex((s) => s.id === id);
    if (index === -1) return null;

    const existing = this.userSkills[index];
    const updated: Skill = {
      ...existing,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      content: data.content ?? existing.content,
      updatedAt: new Date().toISOString(),
    };

    this.userSkills[index] = updated;
    this.saveUserSkills();
    return updated;
  }

  public deleteUserSkill(id: string): boolean {
    const index = this.userSkills.findIndex((s) => s.id === id);
    if (index === -1) return false;

    this.userSkills.splice(index, 1);
    this.saveUserSkills();
    return true;
  }

  public setEnabled(id: string, enabled: boolean): void {
    const builtinSkill = this.builtinSkills.find((s) => s.id === id);
    if (builtinSkill) {
      builtinSkill.enabled = enabled;
      const disabledIds = loadDisabledBuiltinIds();
      if (enabled) {
        disabledIds.delete(id);
      } else {
        disabledIds.add(id);
      }
      saveDisabledBuiltinIds(disabledIds);
      return;
    }

    const userSkill = this.userSkills.find((s) => s.id === id);
    if (userSkill) {
      userSkill.enabled = enabled;
      this.saveUserSkills();
    }
  }
}

export const skillRegistry = new SkillRegistry();

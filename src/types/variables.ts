export interface GameVariablesRoot {
  schemaVersion: "4.0.0";
  world: {
    time: {
      displayText: string;
      dayIndex?: number;
      timeSlot?: string;
    };
    location: {
      id: string;
      name: string;
      description?: string;
    };
    affairs: Record<
      string,
      {
        title: string;
        description: string;
        status: "进行中" | "已完成" | "失败";
        stage?: string;
        relatedCharacterIds?: string[];
        relatedLocationId?: string;
      }
    >;
    flags: Record<string, boolean>;
  };
  player: {
    profile: {
      name: string;
      age: number;
      gender: "男" | "女";
      bodyType?: string;
      hairStyle?: string;
      eyeColor?: string;
    };
    combat: {
      level: number;
      exp: number;
      hp: {
        current: number;
        max: number;
      };
      mp: {
        current: number;
        max: number;
      };
      attack: number;
      defense: number;
      agility: number;
      intelligence: number;
      allocatedPoints: {
        attack: number;
        defense: number;
        agility: number;
        intelligence: number;
      };
      unspentPoints: number;
    };
    money: number;
    equipment: {
      accessory: string | null;
    };
    relationships: Record<string, number>;
    learnedSkills: Record<string, string[]>;
    flags: Record<string, boolean>;
  };
  characters: Record<
    string,
    {
      displayName: string;
      identity: string;
      relationshipTag: string;
      awakeningStatus: "未知" | "预备役" | "现役" | "退役";
      currentState?: string;
      combat?: {
        level: number;
        exp: number;
        hp: {
          current: number;
          max: number;
        };
        mp: {
          current: number;
          max: number;
        };
        attack: number;
        defense: number;
        agility: number;
        intelligence: number;
        allocatedPoints: {
          attack: number;
          defense: number;
          agility: number;
          intelligence: number;
        };
        unspentPoints: number;
      } | null;
      inParty?: boolean;
      flags?: Record<string, boolean>;
      equipment?: { accessory: string | null };
      equippedSkills?: string[];
    }
  >;
  inventory: {
    items: Record<string, number>;
    battleItems: Record<string, number>;
  };
}

export interface VariablePathPatch {
  path: string;
  value: unknown;
}

export interface VariablePatchEnvelope {
  request_id: string;
  context_version: number;
  state_hash: string;
  tool_call_id: string;
  patches: VariablePathPatch[];
}

export interface VariableValueRecord {
  rootId: string;
  version: number;
  stateHash: string;
  updatedAt: string;
  root: GameVariablesRoot;
}

export interface VariableChangeLogRecord {
  id: string;
  rootId: string;
  requestId: string;
  toolCallId: string;
  contextVersion: number;
  stateHashBefore: string;
  stateHashAfter: string;
  patches: VariablePathPatch[];
  createdAt: string;
}

export type PreviousValueMap = Map<string, unknown>;

export interface VariablePatchResult {
  next: VariableValueRecord;
  nextHash: string;
  previousValues: PreviousValueMap;
}

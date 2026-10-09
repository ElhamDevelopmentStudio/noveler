import { useState, useMemo } from "react";
import {
  RiChat1Line,
  RiLightbulbLine,
  RiTerminalBoxLine,
  RiBookOpenLine,
  RiSearchLine,
  RiCheckLine,
  RiCloseLine,
  RiSparklingLine,
  RiUser3Line,
} from "@remixicon/react";
import type {
  Character,
  ScriptSegment,
  ScriptSegmentUpdateDto,
  SegmentDelivery,
} from "@novelova/shared-types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface SegmentSpeakerPopoverProps {
  segment: ScriptSegment;
  characters: Character[];
  onUpdate: (payload: ScriptSegmentUpdateDto) => Promise<void>;
  children: React.ReactNode;
}

const DELIVERY_MODES: {
  id: SegmentDelivery;
  label: string;
  icon: typeof RiChat1Line;
  description: string;
}[] = [
  {
    id: "dialogue",
    label: "Dialogue",
    icon: RiChat1Line,
    description: "Character spoken dialogue",
  },
  {
    id: "internal_thought",
    label: "Thought",
    icon: RiLightbulbLine,
    description: "Internal monologue",
  },
  {
    id: "system_prompt",
    label: "System",
    icon: RiTerminalBoxLine,
    description: "LitRPG / UI chime announcement",
  },
  {
    id: "narration",
    label: "Narration",
    icon: RiBookOpenLine,
    description: "Neutral third-person voice",
  },
];

const PARALINGUISTIC_TAGS = [
  "[laugh]",
  "[sigh]",
  "[gasp]",
  "[groan]",
  "[chuckle]",
  "[cough]",
  "[sniff]",
  "[shush]",
  "[clear throat]",
];

export function SegmentSpeakerPopover({
  segment,
  characters,
  onUpdate,
  children,
}: SegmentSpeakerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"speaker" | "delivery" | "emotion">("speaker");
  const [saving, setSaving] = useState(false);

  const currentDelivery: SegmentDelivery =
    segment.delivery_type ||
    (segment.is_internal_thought
      ? "internal_thought"
      : segment.is_dialogue
        ? "dialogue"
        : "narration");

  const filteredCharacters = useMemo(() => {
    if (!search.trim()) return characters;
    const query = search.toLowerCase().trim();
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.role_description && c.role_description.toLowerCase().includes(query)),
    );
  }, [characters, search]);

  const handleDeliverySelect = async (delivery: SegmentDelivery) => {
    setSaving(true);
    try {
      const payload: ScriptSegmentUpdateDto = {
        delivery_type: delivery,
      };
      if (delivery === "narration" || delivery === "internal_thought") {
        payload.speaker = "Narrator";
        payload.speaker_gender = "neutral";
        payload.character_id = null;
      } else if (delivery === "system_prompt") {
        payload.speaker = "System / Interface";
        payload.speaker_gender = "neutral";
        payload.character_id = null;
      }
      await onUpdate(payload);
    } finally {
      setSaving(false);
    }
  };

  const handleSpeakerSelect = async (
    speakerName: string,
    gender: string = "neutral",
    characterId: string | null = null,
  ) => {
    setSaving(true);
    try {
      const isSystem = speakerName === "System / Interface";
      const isNarrator = speakerName === "Narrator";
      const delivery: SegmentDelivery = isSystem
        ? "system_prompt"
        : isNarrator
          ? "narration"
          : "dialogue";

      await onUpdate({
        speaker: speakerName,
        speaker_gender: gender,
        character_id: characterId,
        delivery_type: delivery,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleEmotionSelect = async (tag: string | null) => {
    setSaving(true);
    try {
      await onUpdate({
        emotion: tag,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 p-0 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden text-neutral-900 dark:text-neutral-100"
      >
        {/* Sub-header Tabs */}
        <div className="flex items-center border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 px-2 py-1">
          <button
            type="button"
            onClick={() => setActiveTab("speaker")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center ${
              activeTab === "speaker"
                ? "bg-white dark:bg-neutral-800 shadow-2xs text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            Speaker
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("delivery")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center ${
              activeTab === "delivery"
                ? "bg-white dark:bg-neutral-800 shadow-2xs text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            Delivery
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("emotion")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center ${
              activeTab === "emotion"
                ? "bg-white dark:bg-neutral-800 shadow-2xs text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            Emotion
          </button>
        </div>

        {/* Tab 1: Speaker Reassignment */}
        {activeTab === "speaker" && (
          <div className="p-3 space-y-3">
            <div className="relative">
              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search speaker or character..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/50 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 placeholder:text-neutral-400"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {/* Narrator Option */}
              <button
                type="button"
                onClick={() => handleSpeakerSelect("Narrator", "neutral", null)}
                disabled={saving}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  segment.speaker === "Narrator"
                    ? "bg-neutral-100 dark:bg-neutral-800 font-medium"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
                    <RiBookOpenLine className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">Narrator</span>
                    <p className="text-[10px] text-neutral-400">Default audiobook voice</p>
                  </div>
                </div>
                {segment.speaker === "Narrator" && (
                  <RiCheckLine className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
                )}
              </button>

              {/* System Option */}
              <button
                type="button"
                onClick={() => handleSpeakerSelect("System / Interface", "neutral", null)}
                disabled={saving}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  segment.speaker === "System / Interface"
                    ? "bg-cyan-50 dark:bg-cyan-950/40 font-medium text-cyan-900 dark:text-cyan-100"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center text-cyan-700 dark:text-cyan-300">
                    <RiTerminalBoxLine className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold">System / Interface</span>
                    <p className="text-[10px] text-neutral-400">LitRPG chime & prompts</p>
                  </div>
                </div>
                {segment.speaker === "System / Interface" && (
                  <RiCheckLine className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                )}
              </button>

              {/* Character List */}
              {filteredCharacters.length > 0 && (
                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase px-2 mb-1 block">
                    Characters ({filteredCharacters.length})
                  </span>
                  {filteredCharacters.map((char) => {
                    const isSelected =
                      segment.character_id === char.id ||
                      (!segment.character_id && segment.speaker === char.name);

                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => handleSpeakerSelect(char.name, char.gender, char.id)}
                        disabled={saving}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-neutral-100 dark:bg-neutral-800 font-medium"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback seed={char.slug || char.name}>
                              <RiUser3Line className="h-3 w-3" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                {char.name}
                              </span>
                              <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-neutral-200/60 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 shrink-0">
                                {char.gender}
                              </span>
                            </div>
                            {char.role_description && (
                              <p className="text-[10px] text-neutral-400 truncate">
                                {char.role_description}
                              </p>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <RiCheckLine className="h-4 w-4 text-neutral-900 dark:text-neutral-100 shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Delivery Mode */}
        {activeTab === "delivery" && (
          <div className="p-3 space-y-1.5">
            <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase px-1 mb-1 block">
              Delivery Type
            </span>
            {DELIVERY_MODES.map((mode) => {
              const Icon = mode.icon;
              const isSelected = currentDelivery === mode.id;

              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleDeliverySelect(mode.id)}
                  disabled={saving}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  <div className="mt-0.5 p-1 rounded-md bg-neutral-200/60 dark:bg-neutral-700/60 text-neutral-700 dark:text-neutral-200 shrink-0">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {mode.label}
                      </span>
                      {isSelected && (
                        <RiCheckLine className="h-4 w-4 text-neutral-900 dark:text-neutral-100" />
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5 leading-tight">
                      {mode.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab 3: Emotion / Paralinguistic Tags */}
        {activeTab === "emotion" && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                Paralinguistic Expressions
              </span>
              {segment.emotion && (
                <button
                  type="button"
                  onClick={() => handleEmotionSelect(null)}
                  disabled={saving}
                  className="text-[10px] text-destructive hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <RiCloseLine className="h-3 w-3" />
                  Clear tag
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {PARALINGUISTIC_TAGS.map((tag) => {
                const isSelected = segment.emotion === tag;

                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleEmotionSelect(isSelected ? null : tag)}
                    disabled={saving}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer border ${
                      isSelected
                        ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-100"
                        : "bg-neutral-50/50 dark:bg-neutral-800/40 text-neutral-700 dark:text-neutral-300 border-neutral-200/80 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span className="truncate">{tag}</span>
                    {isSelected && <RiSparklingLine className="h-3 w-3 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

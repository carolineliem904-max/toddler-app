// Indonesian voice line manifest. Files are NOT part of this slice — see
// HANDOFF's voice-recording checklist table for the filename <-> line
// mapping to record against. AudioManager loads these from
// `public/audio/voice/<file>` and must stay fully functional if none exist.
export type VoiceKey =
  | 'theme_colors_intro'
  | 'theme_shapes_intro'
  | 'theme_shadows_intro'
  | 'theme_objects_intro'
  | 'theme_destinations_intro'
  | 'theme_animals_intro'
  | 'theme_vehicles_intro'
  | 'theme_fruits_intro'
  | 'game_fruitsort_intro'
  | 'praise_1'
  | 'praise_2'
  | 'praise_3'
  | 'praise_4';

interface VoiceLine {
  file: string;
  /** Indonesian line text — the recording script, not shown in-game (no text in gameplay, per CLAUDE.md). */
  text: string;
}

export const VOICE_DIR = 'audio/voice/';

export const VOICE_MANIFEST: Record<VoiceKey, VoiceLine> = {
  theme_colors_intro: { file: 'theme_colors_intro.mp3', text: 'Ayo cocokkan warnanya!' },
  theme_shapes_intro: { file: 'theme_shapes_intro.mp3', text: 'Ayo cocokkan bentuknya!' },
  theme_shadows_intro: { file: 'theme_shadows_intro.mp3', text: 'Dimanakah bayanganku?' },
  theme_objects_intro: { file: 'theme_objects_intro.mp3', text: 'Ayo cari yang sama!' },
  theme_destinations_intro: { file: 'theme_destinations_intro.mp3', text: 'Di mana rumahku?' },
  theme_animals_intro: { file: 'theme_animals_intro.mp3', text: 'Ayo cari hewannya!' },
  theme_vehicles_intro: { file: 'theme_vehicles_intro.mp3', text: 'Ayo cari kendaraannya!' },
  theme_fruits_intro: { file: 'theme_fruits_intro.mp3', text: 'Ayo cari buahnya!' },
  game_fruitsort_intro: { file: 'game_fruitsort_intro.mp3', text: 'Ayo pilah buahnya!' },
  praise_1: { file: 'praise_1.mp3', text: 'Pintar!' },
  praise_2: { file: 'praise_2.mp3', text: 'Hebat!' },
  praise_3: { file: 'praise_3.mp3', text: 'Yeay!' },
  praise_4: { file: 'praise_4.mp3', text: 'Bagus sekali!' },
};

// theme.id -> its intro voice key. MatchScene.create() looks this up once
// per theme entry (see AudioManager.ts / MatchScene decisions in HANDOFF).
export const THEME_INTRO_VOICE: Record<string, VoiceKey> = {
  colors: 'theme_colors_intro',
  shapes: 'theme_shapes_intro',
  shadows: 'theme_shadows_intro',
  objects: 'theme_objects_intro',
  destinations: 'theme_destinations_intro',
  animals: 'theme_animals_intro',
  vehicles: 'theme_vehicles_intro',
  fruits: 'theme_fruits_intro',
};

// Same idea as THEME_INTRO_VOICE but keyed by SortGame.id (src/data/sortGames.ts)
// — SortScene looks this up once per menu -> game entry, same as MatchScene.
export const SORT_GAME_INTRO_VOICE: Record<string, VoiceKey> = {
  fruitsort: 'game_fruitsort_intro',
};

export const PRAISE_VOICE_KEYS: VoiceKey[] = ['praise_1', 'praise_2', 'praise_3', 'praise_4'];

import { THEMES, type Theme } from './themes';
import { SORT_GAMES, type SortGame } from './sortGames';

// Unifies MatchScene themes and SortScene games into one menu list. `id` is
// unique across both catalogs (theme ids and sort-game ids don't collide)
// and doubles as the CARD_ICON_OVERRIDE / intro-voice lookup key for its kind.
export type MenuEntry =
  | { kind: 'match'; id: string; theme: Theme }
  | { kind: 'sort'; id: string; game: SortGame };

export const MENU_ENTRIES: MenuEntry[] = [
  ...THEMES.map((theme): MenuEntry => ({ kind: 'match', id: theme.id, theme })),
  ...SORT_GAMES.map((game): MenuEntry => ({ kind: 'sort', id: game.id, game })),
];

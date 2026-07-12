import { THEMES, type Theme } from './themes';
import { SORT_GAMES, type SortGame } from './sortGames';
import { QUIZ_GAMES, type QuizGame } from './quizGames';

// Unifies MatchScene themes, SortScene games, and QuizScene games into one
// menu list. `id` is unique across all three catalogs (theme/sort-game/
// quiz-game ids don't collide) and doubles as the CARD_ICON_OVERRIDE /
// intro-voice lookup key for its kind.
export type MenuEntry =
  | { kind: 'match'; id: string; theme: Theme }
  | { kind: 'sort'; id: string; game: SortGame }
  | { kind: 'quiz'; id: string; game: QuizGame };

export const MENU_ENTRIES: MenuEntry[] = [
  ...THEMES.map((theme): MenuEntry => ({ kind: 'match', id: theme.id, theme })),
  ...SORT_GAMES.map((game): MenuEntry => ({ kind: 'sort', id: game.id, game })),
  ...QUIZ_GAMES.map((game): MenuEntry => ({ kind: 'quiz', id: game.id, game })),
];

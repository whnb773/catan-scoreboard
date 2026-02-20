# Catan Scoreboard

A digital scoreboard for Settlers of Catan with cloud sync, player profiles, and a global leaderboard.

## Features

- **Scoreboard** — track VP for up to 4 players (Base or E&P ruleset)
- **Virtual 2d6** — roll dice, view distribution chart, hot/cold number stats
- **Timer & rounds** — game timer with pause/resume and optional round counter
- **Undo/redo** — full undo history (150 steps)
- **Backup & restore** — export/import JSON backups, local snapshots
- **Google Sign-In** — optional authentication via Firebase Auth
- **Cloud sync** — active game state saved to Firestore per user
- **Player profiles** — aggregate stats (games, wins, streaks, VP, avg margin)
- **Game setup modal** — search and select registered players before starting; guest slots supported
- **Profile tab** — view your stats and last 20 games; edit display name
- **Global leaderboard** — ranked by wins across all registered players

## Tech stack

- Vanilla JS, HTML, CSS — no framework
- Firebase Auth (Google OAuth)
- Cloud Firestore (game state, player profiles, game records)
- Hosted as a static site (SiteGround)

## Project structure

```
index.html
css/
  variables.css     CSS custom properties and design tokens
  layout.css        Grid and responsive layout
  components.css    Buttons, cards, modals, player slots, etc.
  animations.css    Dice, confetti, transitions
js/
  config.js         Constants (storage keys, colours, timing)
  state.js          Global state + helper functions
  storage.js        localStorage save/load, undo/redo, export/import
  ui.js             DOM rendering (players, scores, photos)
  dice.js           Roll logic, turn tracking, charts
  firestore-profiles.js  User profiles, leaderboard, player search, stats
  firebase-auth.js  Google Sign-In, auth state, profile caching
  firebase-firestore.js  Live game sync, game record saving
  app.js            Init, event wiring, setup modal, profile/leaderboard tabs
  firebase-config.js     (git-ignored) Firebase project credentials
```

## Firestore schema

| Collection | Doc | Contents |
|---|---|---|
| `users/{uid}` | — | displayName, email, avatarUrl, colourPref, stats (games/wins/streaks/VP) |
| `users/{uid}/games/current` | — | Live game state (full exportState snapshot) |
| `users/{uid}/meta/gameRefs` | — | Array of last 20 game IDs |
| `games/{gameId}` | — | Completed game record: players, scores, winner, duration, ruleset |

## Setup (local dev)

1. Copy `js/firebase-config.example.js` → `js/firebase-config.js` and fill in your Firebase credentials
2. Open `index.html` with Live Server (VS Code) or any static file server
3. Set Firestore security rules in the Firebase Console (see below)

## Required Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }
    match /games/{gameId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.hostUid;
    }
  }
}
```

## Required Firestore indexes

Create these composite indexes in the Firebase Console:

| Collection | Fields | Order |
|---|---|---|
| `users` | `totalWins` | Descending |
| `games` | `hostUid` ASC, `endedAt` DESC | — |

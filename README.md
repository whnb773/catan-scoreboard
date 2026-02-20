# Catan Scoreboard

A digital scoreboard for Settlers of Catan with cloud sync, player profiles, and a global leaderboard.

## Features

- **Scoreboard** — track VP for up to 4 players (Base or E&P ruleset)
- **Virtual 2d6** — roll dice, view distribution chart, hot/cold number stats
- **Timer & rounds** — game timer with pause/resume and optional round counter
- **Undo/redo** — full undo history (150 steps)
- **Backup & restore** — export/import JSON backups, local snapshots
- **Google Sign-In** — full-page login screen gates access; signs in via Firebase Auth
- **Host/Join flow** — host creates lobby with 6-digit PIN + QR code; players join by PIN; realtime lobby list; host starts game for all
- **Three-screen app** — Login → Host/Join → Game Panel (or Player View for non-hosts)
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
  config.js         Constants (storage keys, colours, timing, admin email list)
  state.js          Global state + helper functions
  storage.js        localStorage save/load, undo/redo, export/import
  ui.js             DOM rendering (players, scores, photos)
  dice.js           Roll logic, turn tracking, charts
  firestore-profiles.js  User profiles, leaderboard, player search, stats
  lobby.js          Host/Join lobby CRUD + real-time Firestore listener
  firebase-auth.js  Google Sign-In, auth state, screen routing (showScreen)
  firebase-firestore.js  Live game sync, game record saving
  app.js            Init, event wiring, host/join UI, setup modal, profile/leaderboard tabs
  firebase-config.js     (git-ignored) Firebase project credentials
```

## Firestore schema

| Collection | Doc | Contents |
|---|---|---|
| `users/{uid}` | — | displayName, email, avatarUrl, colourPref, stats (games/wins/streaks/VP) |
| `users/{uid}/games/current` | — | Live game state (full exportState snapshot) |
| `users/{uid}/meta/gameRefs` | — | Array of last 20 game IDs |
| `games/{gameId}` | — | Completed game record: players, scores, winner, duration, ruleset |
| `lobbies/{lobbyId}` | — | pin, createdAt, hostUid, status (waiting/active/ended), players array |

## Setup (local dev)

1. Copy `js/firebase-config.example.js` → `js/firebase-config.js` and fill in your Firebase credentials
2. Open `index.html` with Live Server (VS Code) or any static file server
3. Set Firestore security rules in the Firebase Console (see below)
4. Update the `ADMIN_EMAILS` array in `js/config.js` with the email addresses that should receive the Admin badge

## Required Firestore security rules

Paste these into **Firebase Console → Firestore Database → Rules**. Update the email addresses in `isAdmin()` to match the `ADMIN_EMAILS` list in `js/config.js`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Admins can read/write anything
    function isAdmin() {
      return request.auth != null &&
        request.auth.token.email in [
          'your-admin@email.com',
          'your-other-admin@email.com'
        ];
    }

    // User profiles and all subcollections (games/current, meta/gameRefs, etc.)
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid || isAdmin();

      match /{subcollection=**} {
        allow read: if request.auth != null;
        allow write: if request.auth.uid == uid || isAdmin();
      }
    }

    // Completed game records
    match /games/{gameId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.hostUid || isAdmin();
    }

    // Game lobbies (Host/Join flow)
    match /lobbies/{lobbyId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth.uid == resource.data.hostUid || isAdmin();
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

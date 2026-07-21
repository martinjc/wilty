# Would Cardiff University Lie to You?

A real-time "truth or lie" interactive presentation voting app designed for conferences and live events at Cardiff University. Presenters share statements and the audience votes on whether each one is true or a lie.

## Features

- **Real-time sync** — Votes, tally bars, and game state update instantly across all clients via Socket.IO
- **Three-view interface** — Main display screen (projector), admin console (presenter), and audience mobile voting page
- **Clickable QR code** on the main display for instant audience participation
- **Admin presets** with pre-loaded sample statements for quick setup
- **Cardiff University branded** styling with official color palette

## Tech Stack

| Layer     | Technologies                        |
|-----------|-------------------------------------|
| Backend   | Node.js, Express, Socket.IO         |
| Frontend  | Vanilla HTML, CSS, JavaScript       |
| Utilities | qrcode (QR generation), ip (network detection) |

## Quick Start

```bash
npm install
npm start
```

The server will start at `http://localhost:3000`. The console logs all the relevant URLs on startup.

## Page URLs

| Role           | URL                  | Description                                       |
|----------------|----------------------|---------------------------------------------------|
| Main Display   | `/` or `/display`    | Projected screen showing statements and live tallies |
| Admin Console  | `/admin`             | Presenter control panel                           |
| Audience Vote  | `/vote`              | Mobile-friendly page for attendees to cast votes  |

## How to Run an Event

1. **Presenter**: Open `/admin`, enter a statement (or pick from presets), set the speaker name, and mark whether it's `Truth` or `Lie`.
2. Click **Start Voting** — the main display updates with the statement and shows a QR code.
3. **Audience**: Scan the QR code (or visit the voting URL) on their phones to cast a `Truth` or `Lie` vote.
4. When enough votes have come in, click **Lock Votes**.
5. Click **Reveal Answer** — the answer appears on both the big screen and each attendee's phone with a "You were right/wrong" message.
6. Click **Reset** to prepare for the next statement.

## Admin Controls

| Field / Button         | Description                                           |
|------------------------|-------------------------------------------------------|
| Speaker name          | Displayed alongside the statement                     |
| Statement text        | The story/statement presented to the audience         |
| Ground Truth           | True/False answer set by the presenter               |
| Preset library         | Pre-loaded sample statements (clicks filled them in)  |
| Start Voting          | Begins a voting round and clears previous votes       |
| Lock Votes            | Closes the voting window                              |
| Reveal Answer         | Shows the correct answer to everyone                  |
| Reset                 | Returns to idle state for the next round              |

## Game Phases

The app tracks four phases broadcast to all clients:

| Phase      | Description                                | Audience Actions              |
|------------|--------------------------------------------|-------------------------------|
| `IDLE`     | Waiting between rounds                     | No voting                     |
| `VOTING`   | Voting is open                              | Submit Truth or Lie vote      |
| `LOCKED`   | Voting is closed, tallying                  | Locked state shown on screen  |
| `REVEALED` | Answer disclosed                            | Personal "right/wrong" result |

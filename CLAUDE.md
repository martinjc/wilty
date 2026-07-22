# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

The application is a real-time, event-driven web application built on Node.js and relies heavily on **Socket.IO** for communication between clients and the server. The architecture is structured around three main viewing roles:

1.  **Backend/Server (Node.js/Express):** This core layer handles routing, state management, and broadcasts real-time events. It manages the overall game state, including statement text, speaker name, truth status, vote tallies, and current phase (`IDLE`, `VOTING`, `LOCKED`, `REVEALED`).
2.  **Admin Console Client (`/admin`):** This client provides the presenter's interface to *write* data into the system state:
    *   Entering new statements (text, speaker).
    *   Setting ground truth (`Truth`/`Lie`).
    *   Controlling the game flow by issuing commands: `Start Voting`, `Lock Votes`, `Reveal Answer`, and `Reset`.
3.  **Main Display Client (`/display`):** This is the public-facing projection screen (the main UI). It acts as a read-only consumer of state, displaying the current statement, speaker name, and real-time vote tallies broadcast by the server.
4.  **Audience Voting Client (`/vote`):** A dedicated mobile view that is solely responsible for sending discrete vote events (`Truth`/`Lie`) back to the central Socket.IO server instance.

Interaction flow is strictly **Client $\rightarrow$ Server $\rightarrow$ Broadcast $\rightarrow$ Clients**. Any changes must initiate through the Admin Console and be broadcasted via Socket.IO.

## Development Workflow & Commands

The following commands are based on project observations:

*   **Install Dependencies:**
    ```bash
    npm install
    ```
*   **Run Application (Development/Testing):**
    ```bash
    npm start
    ```

## Core Modules and Functionality Summary

This system is segmented by roles, which defines the primary entry points for development:

*   **Socket.IO:** The central mechanism for all communication. Any changes to game state or UI updates must route through event emitters on this layer.
*   **State Management:** Logic governing phase transitions (`IDLE` $\rightarrow$ `VOTING`, etc.) and the storage/validation of statements (text, speaker, truth status).
*   **Frontend Views:** Development should be scoped to specific client concerns: Admin UI interaction logic, Public Display rendering/data fetching, or Voting input handling.

## File Structure Notes

While a complete file listing is omitted, developers should recognize that the following types of files/modules are critical for maintaining separation of concerns:
*   `server.js`/`index.js`: Central Express setup and Socket.IO listeners.
*   `routes/admin.js`: Handles admin specific API endpoints and UI rendering for `/admin`.
*   `sockets/game-state.js`: Module responsible for encapsulating game state changes and broadcasting logic.
*   `views/display.html`, `views/admin.html`, `views/vote.html`: Contain the respective frontend templates and associated client-side JavaScript handlers.
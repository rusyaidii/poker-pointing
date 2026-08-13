import type { DeckType, Participant, HistoryEntry, RoomState } from "../../party/server";

export function randCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]; // Generate a random 6 character code
    return code;
}

// Stable identity across refreshes
// If a user leaves the page and comes back, they should have the same PID
export function getOrCreatePid(): string {
    if (typeof window === "undefined") return "";
    let pid = localStorage.getItem("pp:pid");
    if (!pid) {
        pid = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); // Generate a random 10 character code
        localStorage.setItem("pp:pid", pid);
    }
    return pid;
}
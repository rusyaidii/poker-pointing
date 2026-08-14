"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartySocket } from "partysocket";
import { PARTY_HOST } from "@/lib/party";
import { getOrCreatePid } from "@/lib/room";
import { DeckType, type RoomState } from "../../../../party/server";
import { computeStats, DECKS, numericValue, isNumericDeck, DECK_LABELS } from "@/lib/deck";

const SunIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <circle cx="10" cy="10" r="3.2" />
        <path d="M10 2.3v1.6M10 16v1.6M17.7 10h-1.6M3.9 10H2.3M15.4 4.6l-1.2 1.2M5.8 14.2l-1.2 1.2M15.4 15.4l-1.2-1.2M5.8 5.8 4.6 4.6" />
    </svg>
);
const MoonIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" />
    </svg>
);
const CopyIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M4.5 13H3.8A1.8 1.8 0 0 1 2 11.2V3.8A1.8 1.8 0 0 1 3.8 2h7.4A1.8 1.8 0 0 1 13 3.8v.7" />
    </svg>
);
const DownloadIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3v9m0 0-3.3-3.3M10 12l3.3-3.3" />
        <path d="M3.5 14v1.7A1.8 1.8 0 0 0 5.3 17.5h9.4a1.8 1.8 0 0 0 1.8-1.8V14" />
    </svg>
);

function fireConfetti(layer: HTMLDivElement | null) {
    if (!layer) return;

    const colors = ["#E4572E", "#D9A62E", "#5C8DF6", "#F2EFE9", "#1B4332"];

    for (let i = 0; i < 36; i++) {
        const p = document.createElement("div");
        p.className = "pp-confetti-piece";
        const size = 5 + Math.random() * 5;
        p.style.width = `${size}px`;
        p.style.height = `${size * 0.6}px`;
        p.style.left = `${Math.random() * 100}%`;
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = `${1.4 + Math.random() * 1.1}s`;
        p.style.animationDelay = `${Math.random() * 0.3}s`;
        layer.appendChild(p);
        setTimeout(() => p.remove(), 3200);
    }
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const router = useRouter();
    const socketRef = useRef<PartySocket | null>(null);
    const confettiRef = useRef<HTMLDivElement | null>(null);
    const storyFocused = useRef(false);
    const prevRevealed = useRef(false);

    const [room, setRoom] = useState<RoomState | null>(null);
    const [connected, setConnected] = useState(false);
    const [me, setMe] = useState("");
    const [theme, setTheme] = useState<"light" | "dark">("dark");
    const [copied, setCopied] = useState(false);
    const [elapsed, setElapsed] = useState("00:00");
    const [storyDraft, setStoryDraft] = useState("");

    // Initialize the room
    useEffect(() => {
        const name = sessionStorage.getItem("pp:name");
        if (!name) {
            router.replace("/");
            return;
        }

        const participantId = getOrCreatePid();
        setMe(participantId);
        setTheme((document.documentElement.dataset.theme as "light" | "dark") || "dark");

        const initDeck = sessionStorage.getItem("pp:deck") ?? undefined;
        const initStory = sessionStorage.getItem("pp:story") ?? undefined;

        const ps = new PartySocket({ host: PARTY_HOST, party: "room", room: code });
        socketRef.current = ps;

        ps.addEventListener("open", () => {
            setConnected(true);
            ps.send(JSON.stringify({ type: "join", participantId, name, initDeck, initStory }));
        });
        ps.addEventListener("close", () => setConnected(false));
        ps.addEventListener("message", (event) => {
            const msg = JSON.parse(event.data as string);
            if (msg.type === "state") setRoom(msg.room as RoomState);
        });
        
        return () => ps.close();
    }, [code, router]);

    const send = useCallback((data: unknown) => socketRef.current?.send(JSON.stringify(data)), []);

    // Keep the story draft in sync unless the user is actively editing the story.
    useEffect(() => {
        if (room && !storyFocused.current) setStoryDraft(room.storyTitle);
    }, [room?.storyTitle]);

    // Round timer countdown
    useEffect(() => {
        if (!room) return;
        const startedAt = room.roundStartedAt;
        const tick = () => {
            const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            const mm = String(Math.floor(secs / 60)).padStart(2, "0");
            const ss = String(secs % 60).padStart(2, "0");
            setElapsed(`${mm}:${ss}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [room?.roundStartedAt]);

    // Confetti when the round is revealed and there is a consensus.
    useEffect(() => {
        if (!room) return;
        if (room.revealed && !prevRevealed.current) {
            const vals = Object.values(room.votes);
            if (vals.length > 1 && vals.every((v) => v === vals[0])) fireConfetti(confettiRef.current);
        }
        prevRevealed.current = room.revealed;
    }, [room?.revealed]);

    // Keyboard voting shortcut
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!room || room.revealed) return;
            const el = document.activeElement;
            if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
            if (room.participants[me]?.isSpectator) return;

            const cards = DECKS[room.deckType] ?? DECKS.fibonacci;
            let idx = -1;
            if (e.key >= "1" && e.key <= "9") idx = parseInt(e.key, 10) - 1;
            else if (e.key === "0") idx = 9;
            if (idx >= 0 && idx < cards.length) send({ type: "vote", value: cards[idx] });
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [room, me, send]);

    const toggleTheme = () => {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        document.documentElement.dataset.theme = next;
    };

    // Flash the copied state for 1.5 seconds.
    const flashCopied = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    const copyInvite = () => {
        navigator.clipboard?.writeText(`${location.origin}/room/${code}`);
        flashCopied();
    }

    const leave = () => {
        send({ type: "leave" });
        socketRef.current?.close();
        router.push("/");
    }

    const exportHistory = () => {
        if (!room) return;
        const lines = [`Pointing Poker — room ${room.code}`, ""];
        [...room.history].reverse().forEach((h) => {
            const bits: string[] = [];
            if (isNumericDeck(room.deckType) && h.average !== null) bits.push(`avg ${h.average.toFixed(1)}`);
            if (h.consensus) bits.push(`${h.consensus} ✅`);
            lines.push(`Round ${h.round} — ${h.title}: ${bits.join(", ") || "mixed votes"}`);
        });

        navigator.clipboard?.writeText(lines.join("\n"));
        flashCopied();
    };

    if (!room) {
        return (
            <div className="min-h-screen bg-bg text-text font-body grid place-items-center">
                <p className="text-text-dim">{connected ? "Loading room…" : "Connecting…"}</p>
            </div>
        );
    }

    const participants = Object.entries(room.participants);
    const iAmSpectator = room.participants[me]?.isSpectator ?? false;
    const myVote = room.votes[me];
    const cards = DECKS[room.deckType] ?? DECKS.fibonacci;
    const stats = room.revealed && Object.keys(room.votes).length > 0 ? computeStats(room) : null;

    const numericVals = 
        room.revealed && isNumericDeck(room.deckType)
            ? Object.values(room.votes).map(numericValue).filter((v): v is number => v !== null)
            : [];
    const minVal = numericVals.length > 0 ? Math.min(...numericVals) : null;
    const maxVal = numericVals.length > 0 ? Math.max(...numericVals) : null;
    const maxCount = stats ? Math.max(1, ...stats.distribution.map((d) => d.count)) : 1; // Prevent division by zero

    return (
        <div className="pp">
            <div ref={confettiRef} className="pp-confetti-layer"/>

            <div className="pp-room-bar">
                <div className="pp-room-id">
                    <span className="pp-room-label">Room</span>
                    <span className="pp-room-code">{room.code}</span>
                    <button className="pp-icon-btn" onClick={copyInvite} title="Copy Invite">
                        <CopyIcon />
                    </button>
                    <span className={`pp-copied-tag ${copied ? "pp-show" : ""}`}>Copied!</span>
                </div>
                
                <div className="pp-room-timer">{elapsed}</div>
                <div className="pp-room-controls">
                    <label className="pp-switch">
                        <input
                            type="checkbox"
                            checked={room.revealed}
                            onChange={(e) => send({ type: "setAutoReveal", value: e.target.checked })}
                        />
                        Auto Reveal
                    </label>

                    <label className="pp-switch">
                        <input
                            type="checkbox"
                            checked={iAmSpectator}
                            onChange={(e) => send({ type: "setSpectator", value: e.target.checked })}
                        />
                        Observing Only
                    </label>

                    <button className="pp-icon-btn" onClick={toggleTheme} title="Toggle Theme">
                        {theme === "light" ? <MoonIcon /> : <SunIcon />}
                    </button>

                    <button className="pp-btn pp-btn-danger" onClick={leave}>
                        Leave
                    </button>
                </div>
            </div>

            <div className="pp-title-row">
                <input
                    className="pp-story-input"
                    value={storyDraft}
                    placeholder="What are we estimating?"
                    maxLength={80}
                    onFocus={() => storyFocused.current = true}
                    onChange={(e) => setStoryDraft(e.target.value)}
                    onBlur={() => {
                        storyFocused.current = false;
                        send({ type: "setStory", title: storyDraft });
                    }}
                />
                <select
                    className="pp-deck-select"
                    value={room.deckType}
                    onChange={(e) => send({ type: "setDeckType", value: e.target.value as DeckType })}
                >
                    {Object.entries(DECK_LABELS).map(([k, label]) => (
                        <option value={k} key={k}>{label}</option>
                    ))}
                </select>
            </div>

            <div className="pp-room-main">
                <div className="pp-room-center">
                    <div className="pp-participants">
                        {participants.length === 0 ? (
                            <p className="pp-empty">Waiting for players to join..</p>
                        ) : (
                            participants.map(([pid, p]) => {
                                const voted = pid in room.votes;
                                const voteVal = room.votes[pid];
                                let cls = "pp-pcard";
                                let content: React.ReactNode = "";
                                if (p.isSpectator) {
                                    cls += " pp-spectator";
                                    content = "👁";
                                } else if (room.revealed && voted) {
                                    cls += " pp-revealed";
                                    content = voteVal;
                                    const nv = numericValue(voteVal);
                                    if (nv !== null && minVal !== null && maxVal !== null && minVal !== maxVal){
                                        if (nv === maxVal) cls += " pp-outlier-hight";
                                        if (nv === minVal) cls += " pp-outlier-low";
                                    }
                                } else if (voted) {
                                    cls += " pp-voted";
                                }

                                return (
                                    <div className="pp-participant" key={pid}>
                                        <div className={cls}>{content}</div>
                                        <div className={`pp-pname${pid === me ? " pp-you" : ""}`}>
                                            {p.name}
                                            {pid === me ? " (you)" : ""}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {stats && (
                        <div className="pp-stats-panel">
                            {stats.consensus && <div className="pp-consensus-banner">🎉 Consensus — everyone agrees</div>}
                            {isNumericDeck(room.deckType) && (
                                <div className="pp-stat-row">
                                    <div className="pp-stat">
                                        <div className="pp-stat-num">{stats.average !== null ? stats.average.toFixed(1) : "—"}</div>
                                        <div className="pp-stat-label">Average</div>
                                    </div>

                                    <div className="pp-stat">
                                        <div className="pp-stat-num">{stats.median !== null ? stats.median : "—"}</div>
                                        <div className="pp-stat-label">Median</div>
                                    </div>

                                    <div className="pp-stat">
                                        <div className="pp-stat-num">
                                            {stats.min !== null ? `${stats.min}—${stats.max}` : "—"}
                                        </div>
                                        <div className="pp-stat-label">Range</div>
                                    </div>
                                </div>
                            )}

                            {stats.distribution.map((d) => (
                                <div className="pp-dist-row" key={d.label}>
                                    <div className="pp-dist-bar">{d.label}</div>
                                    <div className="pp-dist-bar-track">
                                        <div className="pp-dist-bar-fill" style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }} />
                                    </div>
                                    <div className="pp-dist-count">{d.count}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="pp-deck-row">
                        {cards.map((c) => (
                            <button
                                key={c}
                                className={`pp-vote-card${myVote === c ? " pp-selected" : ""}`}
                                disabled={room.revealed || iAmSpectator}
                                onClick={() => send({ type: "vote", value: c })}
                            >
                                {c}
                            </button>
                        ))}
                    </div>

                    <div className="pp-round-actions">
                        <button
                            className="pp-btn pp-btn-primary"
                            disabled={room.revealed}
                            onClick={() => send({ type: "reveal" })}
                        >
                            {room.revealed ? "Revealed" : "Reveal votes"}
                        </button>

                        <button className="pp-btn pp-btn-outline" onClick={() => send({ type: "newRound" })}>
                            New Round
                        </button>
                        <span className="pp-hint">Tip: press 1-9 to vote fast</span>
                    </div>
                </div>

                <aside className="pp-history-panel">
                        <div className="-pp-history-head">
                            <h3>Round history</h3>
                            <button className="pp-icon-btn" onClick={exportHistory} title="Export history">
                                <DownloadIcon />
                            </button>
                        </div>

                        <div className="pp-history-list">
                            {!room.history || room.history.length === 0 ? (
                                <p className="pp-empty">No rounds finished yet</p>
                            ) : (
                                room.history.map((h, i) => {
                                    const bits: string[] = [];
                                    if (h.consensus) bits.push("consensus");
                                    if (isNumericDeck(room.deckType) && h.average !== null) bits.push(`avg ${h.average.toFixed(1)}`);
                                    return (
                                        <div className="pp-history-item" key={i}>
                                            <div className="pp-history-title">{h.title}</div>
                                            <div className="pp-history-meta">
                                                Round {h.round} · {bits.join(", ")}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </aside>
            </div>
        </div>
    )
}
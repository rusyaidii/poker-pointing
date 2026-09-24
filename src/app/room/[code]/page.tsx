"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartySocket } from "partysocket";
import { PARTY_HOST, roomExists } from "@/lib/party";
import { getOrCreatePid } from "@/lib/room";
import type { DeckType, RoomLayout, RoomState } from "../../../../party/server";
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

const EyeIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.7 10S4.8 4.2 10 4.2 18.3 10 18.3 10 15.2 15.8 10 15.8 1.7 10 1.7 10Z" />
        <circle cx="10" cy="10" r="2.6" />
    </svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
);

// "Nur Aizat" -> "NA", "Wei" -> "WE"
function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// Whole numbers stay whole, fractions get one decimal place.
const fmt = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

const LAYOUTS: [RoomLayout, string][] = [["table", "Poker table"], ["normal", "Normal"]];

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

    const [name, setName] = useState<string | null>(null);
    const [gate, setGate] = useState<"checking" | "missing" | "prompt" | null>(null);
    const [gateName, setGateName] = useState("");

    // Resolve identity: creator or joiner already have a name
    // invite-link visitors get validated and prompted for a name
    useEffect(() => {
        const existing = sessionStorage.getItem("pp:name");
        if (existing) {
            setName(existing);
            return;
        }

        let cancelled = false;
        setGate("checking");
        roomExists("room", code).then((exists) => {
            if (!cancelled) setGate(exists ? "prompt" : "missing");
        });
        return () => { cancelled = true; };
    }, [code]);

    // Initialize the room if we have a name
    useEffect(() => {
        if (!name) return;

        const participantId = getOrCreatePid();
        setMe(participantId);
        setTheme((document.documentElement.dataset.theme as "light" | "dark") || "dark");

        const initDeck = sessionStorage.getItem("pp:deck") ?? undefined;
        const initStory = sessionStorage.getItem("pp:story") ?? undefined;
        const initLayout = (sessionStorage.getItem("pp:layout") as RoomLayout | null) ?? undefined;

        const ps = new PartySocket({ host: PARTY_HOST, party: "room", room: code });
        socketRef.current = ps;

        ps.addEventListener("open", () => {
            setConnected(true);
            ps.send(JSON.stringify({ type: "join", participantId, name, initDeck, initStory, initLayout }));
        });
        ps.addEventListener("close", () => setConnected(false));
        ps.addEventListener("message", (event) => {
            const msg = JSON.parse(event.data as string);
            if (msg.type === "state") setRoom(msg.room as RoomState);
        });
        
        return () => ps.close();
    }, [code, name]);

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

    const submitName = () => {
        const n = gateName.trim();
        if (!n) return;
        sessionStorage.setItem("pp:name", n);
        sessionStorage.removeItem("pp:deck"); // a link-joiner never seeds the deck or story
        sessionStorage.removeItem("pp:story");
        sessionStorage.removeItem("pp:layout");
        setName(n);
    }

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
            if (h.consensus) bits.push("consensus ✅");
            lines.push(`Round ${h.round} — ${h.title}: ${bits.join(", ") || "mixed votes"}`);
        });

        navigator.clipboard?.writeText(lines.join("\n"));
        flashCopied();
    };

    if (!name) {
        return (
            <div className="pp">
                <div className="pp-topbar">
                    <div className="pp-brand">
                        <span className="pp-brand-suit">♠</span>Pointing Poker
                    </div>
                </div>

                <div className="pp-gate">
                    {gate === "missing" ? (
                        <div className="pp-gate-card">
                            <h2>Table not found</h2>
                            <p className="pp-panel-sub">
                                There&apos;s no active table with code <strong>{code}</strong>. Double check
                                the link, or start a fresh session.
                            </p>
                            <button className="pp-btn pp-btn-primary" onClick={() => router.push("/")}>
                                Back to Home →
                            </button>
                        </div>
                    ): gate === "prompt" ? (
                        <div className="pp-gate-card">
                            <div className="pp-gate-code">
                                <span className="pp-room-label">Joining table</span>
                                <span className="pp-room-code">{code}</span>
                            </div>

                            <h2>What should we call you?</h2>
                            <p className="pp-panel-sub">Your teammates will see this name at the table.</p>
                            <label>Your name</label>
                            <input
                                type="text"
                                placeholder="e.g. Aizat"
                                maxLength={24}
                                autoFocus
                                value={gateName}
                                onChange={(e) => setGateName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && submitName()}
                            />
                            <button
                                className="pp-btn pp-btn-primary"
                                onClick={submitName}
                                disabled={!gateName.trim()}
                            >
                                Join Table →
                            </button>
                        </div>
                    ) : (
                        <p className="pp-empty">Checking table...</p>
                    )}
                </div>
            </div>
        )
    }

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
    const players = participants.filter(([, p]) => !p.isSpectator);
    const votedCount = players.filter(([pid]) => pid in room.votes).length;

    const layout: RoomLayout = room.layout ?? "table"; // rooms saved before layouts existed
    const numericVals =
        room.revealed && isNumericDeck(room.deckType)
            ? Object.values(room.votes).map(numericValue).filter((v): v is number => v !== null)
            : [];
    const minVal = numericVals.length > 0 ? Math.min(...numericVals) : null;
    const maxVal = numericVals.length > 0 ? Math.max(...numericVals) : null;
    const maxCount = stats ? Math.max(1, ...stats.distribution.map((d) => d.count)) : 1;

    // Seat everyone around the oval with "you" at the bottom centre, like a dealer's view.
    const myIdx = participants.findIndex(([pid]) => pid === me);
    const seated = myIdx > 0 ? [...participants.slice(myIdx), ...participants.slice(0, myIdx)] : participants;

    return (
        <div className="pp">
            <div ref={confettiRef} className="pp-confetti-layer"/>

            <div className="pp-poker">
                <div className="pp-dealer-rail">
                    <div className="pp-dealer-rail-left">
                        <div className="pp-dealer-brand">
                            <span className="pp-dealer-brand-suit">♠</span>Pointing Poker
                        </div>
                        <div className="pp-dealer-divider" />
                        <div className="pp-dealer-room">
                            <span className="pp-dealer-label">Table</span>
                            <span className="pp-dealer-code">{room.code}</span>
                            <button className="pp-icon-btn pp-dealer-copy" onClick={copyInvite} title="Copy invite">
                                <CopyIcon />
                            </button>
                            <span className={`pp-copied-tag ${copied ? "pp-show" : ""}`}>Copied!</span>
                        </div>
                        <span className="pp-rail-timer" title="Round time">{elapsed}</span>
                    </div>

                    <div className="pp-dealer-rail-right">
                        <label className="pp-toggle">
                            <input
                                type="checkbox"
                                checked={room.autoReveal}
                                onChange={(e) => send({ type: "setAutoReveal", value: e.target.checked })}
                            />
                            <span className="pp-toggle-track" />
                            <span className="pp-toggle-text">Auto reveal</span>
                        </label>

                        <label className="pp-toggle">
                            <input
                                type="checkbox"
                                checked={iAmSpectator}
                                onChange={(e) => send({ type: "setSpectator", value: e.target.checked })}
                            />
                            <span className="pp-toggle-track" />
                            <span className="pp-toggle-text">Observing only</span>
                        </label>

                        <button className="pp-icon-btn" onClick={toggleTheme} title="Toggle theme">
                            {theme === "light" ? <MoonIcon /> : <SunIcon />}
                        </button>

                        <button className="pp-btn pp-btn-danger pp-dealer-leave" onClick={leave}>
                            Leave
                        </button>
                    </div>
                </div>

                <div className="pp-story-bar">
                    <input
                        className="pp-story-input"
                        value={storyDraft}
                        placeholder="What are we estimating?"
                        maxLength={80}
                        onFocus={() => storyFocused.current = true}
                        onChange={(e) => setStoryDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        onBlur={() => {
                            storyFocused.current = false;
                            send({ type: "setStory", title: storyDraft });
                        }}
                    />
                    <select
                        className="pp-deck-select"
                        value={room.deckType}
                        onChange={(e) => send({ type: "setDeck", deckType: e.target.value as DeckType })}
                    >
                        {Object.entries(DECK_LABELS).map(([k, label]) => (
                            <option value={k} key={k}>{label}</option>
                        ))}
                    </select>
                    <div className="pp-segmented" role="radiogroup" aria-label="Room type">
                        {LAYOUTS.map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={layout === value}
                                className={layout === value ? "pp-active" : ""}
                                onClick={() => send({ type: "setLayout", value })}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pp-poker-main">
                    {layout === "normal" ? (
                    <div className="pp-room-center">
                        <div className="pp-participants">
                            {participants.length === 0 ? (
                                <p className="pp-empty">Waiting for players to join…</p>
                            ) : (
                                participants.map(([pid, p]) => {
                                    const voted = pid in room.votes;
                                    const voteVal = room.votes[pid];
                                    let cls = "pp-pcard";
                                    let content: React.ReactNode = "";
                                    if (p.isSpectator) {
                                        cls += " pp-spectator";
                                        content = <EyeIcon />;
                                    } else if (room.revealed && voted) {
                                        cls += " pp-revealed";
                                        content = voteVal;
                                        const nv = numericValue(voteVal);
                                        if (nv !== null && minVal !== null && maxVal !== null && minVal !== maxVal) {
                                            if (nv === maxVal) cls += " pp-outlier-high";
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
                                            <div className="pp-stat-num">{fmt(stats.average)}</div>
                                            <div className="pp-stat-label">Average</div>
                                        </div>
                                        <div className="pp-stat">
                                            <div className="pp-stat-num">{fmt(stats.median)}</div>
                                            <div className="pp-stat-label">Median</div>
                                        </div>
                                        <div className="pp-stat">
                                            <div className="pp-stat-num">
                                                {stats.min !== null ? `${fmt(stats.min)}–${fmt(stats.max)}` : "—"}
                                            </div>
                                            <div className="pp-stat-label">Range</div>
                                        </div>
                                    </div>
                                )}
                                {stats.distribution.map((d) => (
                                    <div className="pp-dist-row" key={d.label}>
                                        <div className="pp-dist-label">{d.label}</div>
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
                                    aria-pressed={myVote === c}
                                    onClick={() => send({ type: "vote", value: c })}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>

                        <div className="pp-round-actions">
                            <button
                                className="pp-btn pp-btn-primary"
                                disabled={room.revealed || votedCount === 0}
                                onClick={() => send({ type: "reveal" })}
                            >
                                {room.revealed ? "Revealed" : "Reveal votes"}
                            </button>
                            <button className="pp-btn pp-btn-outline" onClick={() => send({ type: "newRound" })}>
                                New round
                            </button>
                            <span className="pp-hint">Tip: press 1–9 to vote fast</span>
                        </div>
                    </div>
                    ) : (
                    <div className="pp-poker-center">
                        <div className={`pp-table-oval${seated.length > 8 ? " pp-crowded" : ""}`}>
                            <div className="pp-table-rail" />
                            <div className="pp-table-felt" />

                            {seated.map(([pid, p], i) => {
                                // Ellipse through the rail: 45% / 41.7% of the table box, starting at the bottom.
                                const angle = Math.PI / 2 + (i / seated.length) * Math.PI * 2;
                                const left = 50 + 45 * Math.cos(angle);
                                const top = 50 + 41.7 * Math.sin(angle);
                                const isMe = pid === me;
                                const voted = pid in room.votes;
                                const voteVal = room.votes[pid];

                                let cardCls = "pp-seat-card";
                                let content: React.ReactNode = null;
                                let tag = "";
                                if (p.isSpectator) {
                                    cardCls += " pp-spectator";
                                    content = <EyeIcon />;
                                } else if (room.revealed && voted) {
                                    cardCls += " pp-face";
                                    content = voteVal;
                                    const nv = numericValue(voteVal);
                                    if (nv !== null && minVal !== null && maxVal !== null && minVal !== maxVal) {
                                        if (nv === maxVal) { cardCls += " pp-outlier-high"; tag = "highest"; }
                                        if (nv === minVal) { cardCls += " pp-outlier-low"; tag = "lowest"; }
                                    }
                                } else if (voted) {
                                    cardCls += " pp-back";
                                    content = <span className="pp-seat-check"><CheckIcon /></span>;
                                } else if (!room.revealed) {
                                    cardCls += " pp-thinking";
                                }
                                if (isMe) cardCls += " pp-mine";

                                return (
                                    <div className="pp-seat" key={pid} style={{ left: `${left}%`, top: `${top}%` }}>
                                        <div className="pp-seat-stack">
                                            <span className={`pp-seat-avatar${isMe ? " pp-you" : ""}`}>{initials(p.name)}</span>
                                            <div className={cardCls} key={room.revealed ? "face" : "back"}>{content}</div>
                                        </div>
                                        <span className={`pp-seat-name${isMe ? " pp-you" : ""}`} title={p.name}>
                                            {p.name}
                                            {isMe && " (you)"}
                                        </span>
                                        {tag && <span className={`pp-seat-tag pp-${tag}`}>{tag}</span>}
                                    </div>
                                );
                            })}

                            <div className="pp-pot">
                                <span className="pp-pot-label">In the pot</span>
                                {stats ? (
                                    <>
                                        {stats.consensus && <span className="pp-pot-consensus">★ Consensus</span>}
                                        {isNumericDeck(room.deckType) && stats.average !== null ? (
                                            <div className="pp-chips">
                                                <div className="pp-chip">
                                                    <span className="pp-chip-face pp-chip-gold">{fmt(stats.average)}</span>
                                                    <span className="pp-chip-label">Average</span>
                                                </div>
                                                <div className="pp-chip">
                                                    <span className="pp-chip-face pp-chip-white">{fmt(stats.median)}</span>
                                                    <span className="pp-chip-label">Median</span>
                                                </div>
                                                <div className="pp-chip">
                                                    <span className="pp-chip-face pp-chip-ember">
                                                        {stats.min === stats.max ? fmt(stats.min) : `${fmt(stats.min)}–${fmt(stats.max)}`}
                                                    </span>
                                                    <span className="pp-chip-label">Range</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="pp-pot-tally">
                                                {stats.distribution.map((d) => (
                                                    <span key={d.label}>{d.label} × {d.count}</span>
                                                ))}
                                            </div>
                                        )}
                                        <button className="pp-btn pp-btn-primary" onClick={() => send({ type: "newRound" })}>
                                            New round
                                        </button>
                                    </>
                                ) : room.revealed ? (
                                    <>
                                        <span className="pp-pot-count">No votes cast</span>
                                        <button className="pp-btn pp-btn-primary" onClick={() => send({ type: "newRound" })}>
                                            New round
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className="pp-pot-count">
                                            {players.length === 0 ? "No players yet" : `${votedCount} of ${players.length} dealt in`}
                                        </span>
                                        <button
                                            className="pp-btn pp-btn-primary pp-pot-reveal"
                                            disabled={room.revealed || votedCount === 0}
                                            onClick={() => send({ type: "reveal" })}
                                        >
                                            Reveal votes
                                        </button>
                                        <button className="pp-pot-link" onClick={() => send({ type: "newRound" })}>
                                            New round
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="pp-hand">
                            <span className="pp-hand-label">{iAmSpectator ? "Observing — no hand dealt" : "Your hand"}</span>
                            <div className="pp-hand-fan">
                                {cards.map((c, i) => {
                                    // Fan the deck: spread the rotation evenly, narrower as the deck grows.
                                    const spread = Math.min(28, cards.length * 4);
                                    const rot = cards.length > 1 ? -spread / 2 + (spread * i) / (cards.length - 1) : 0;
                                    const selected = myVote === c;
                                    return (
                                        <button
                                            key={c}
                                            className={`pp-hand-card${selected ? " pp-selected" : ""}`}
                                            style={{ "--rot": `${selected ? 0 : rot}deg` } as React.CSSProperties}
                                            disabled={room.revealed || iAmSpectator}
                                            aria-pressed={selected}
                                            onClick={() => send({ type: "vote", value: c })}
                                        >
                                            {c}
                                        </button>
                                    );
                                })}
                            </div>
                            <span className="pp-hint">Tip: press 1–9 to deal a card fast</span>
                        </div>
                    </div>
                    )}

                    <aside className="pp-ledger">
                        <div className="pp-ledger-head">
                            <h3>Round ledger</h3>
                            <button className="pp-icon-btn" onClick={exportHistory} title="Copy history">
                                <DownloadIcon />
                            </button>
                        </div>

                        <div className="pp-ledger-list">
                            <div className="pp-ledger-row">
                                <div>
                                    <div className="pp-ledger-title">Round {room.round} · {room.storyTitle}</div>
                                    <div className="pp-ledger-meta">{room.revealed ? "revealed" : "in progress…"}</div>
                                </div>
                                {!room.revealed && <span className="pp-ledger-live" />}
                            </div>

                            {room.history?.map((h, i) => (
                                <div className="pp-ledger-row" key={i}>
                                    <div>
                                        <div className="pp-ledger-title">Round {h.round} · {h.title}</div>
                                        <div className={`pp-ledger-meta${h.consensus ? " pp-gold" : ""}`}>
                                            {h.consensus
                                                ? `consensus${h.average !== null ? ` · ${fmt(h.average)}` : ""}`
                                                : h.average !== null
                                                    ? `avg ${h.average.toFixed(1)}${h.spread ? ` · ${h.spread}` : ""}`
                                                    : "mixed votes"}
                                        </div>
                                    </div>
                                    {h.consensus && <span className="pp-ledger-star">★</span>}
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    )
}

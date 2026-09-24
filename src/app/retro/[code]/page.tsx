"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartySocket } from "partysocket";
import { PARTY_HOST, roomExists } from "@/lib/party";
import { getOrCreatePid } from "@/lib/room";
import { type RetroState, type RetroColumn } from "../../../../party/server";

const CopyIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M4.5 13H3.8A1.8 1.8 0 0 1 2 11.2V3.8A1.8 1.8 0 0 1 3.8 2h7.4A1.8 1.8 0 0 1 13 3.8v.7" />
    </svg>
);

const PlayIcon = () => (
    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4.5v11l9-5.5-9-5.5Z" /></svg>
);
const PauseIcon = () => (
    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4h3v12H6zM11 4h3v12h-3z" /></svg>
);
const ResetIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10a6 6 0 1 0 1.8-4.2M4 4v3h3" />
    </svg>
);

const SmileIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="7.3" />
        <path d="M6.8 11.2c.7 1.1 1.9 1.8 3.2 1.8s2.5-.7 3.2-1.8" />
        <path d="M7.3 8h.01M12.7 8h.01" />
    </svg>
);
const QuestionIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2.5a5 5 0 0 1 3 9c-.7.55-1.1 1.15-1.1 2v.5h-3.8v-.5c0-.85-.4-1.45-1.1-2a5 5 0 0 1 3-9Z" />
        <path d="M8.3 16.5h3.4M9 18h2" />
    </svg>
);
const CheckIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
);

const COLUMNS: { key: RetroColumn; title: string; icon: () => React.JSX.Element }[] = [
    { key: "well", title: "Went well", icon: SmileIcon },
    { key: "improve", title: "To improve", icon: QuestionIcon },
    { key: "action", title: "Action items", icon: CheckIcon },
];

const NOTE_ROTATIONS = [-1.4, 0.9, -0.6, 1.1, -1, 0.7, -0.5, 1.3];

function noteRotation(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return NOTE_ROTATIONS[hash % NOTE_ROTATIONS.length];
}

function initials(name: string) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

export default function RetroPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const router = useRouter();
    const socketRef = useRef<PartySocket | null>(null);
    const [retro, setRetro] = useState<RetroState | null>(null);
    const [connected, setConnected] = useState(false);
    const [copied, setCopied] = useState(false);
    const [drafts, setDrafts] = useState<Record<RetroColumn, string>>({ well: "", improve: "", action: "" });
    const [name, setName] = useState<string | null>(null);
    const [gate, setGate] = useState<"checking" | "missing" | "prompt" | null>(null);
    const [gateName, setGateName] = useState("");
    const [nowTs, setNowTs] = useState(Date.now());

    useEffect(() => {
        const existing = sessionStorage.getItem("pp:retroName");
        if (existing) {
            setName(existing);
            return;
        }

        let cancelled = false;
        setGate("checking");
        roomExists("retro",code).then((exist) => {
            if (!cancelled) setGate(exist ? "prompt" : "missing");
        })
        return () => { cancelled = true };
    }, [code]);

    useEffect(() => {
        if (!name) return;

        const participantId = getOrCreatePid();

        const ps = new PartySocket({ host: PARTY_HOST, party: "retro", room: code });
        socketRef.current = ps;

        ps.addEventListener("open", () => {
            setConnected(true);
            ps.send(JSON.stringify({ type: "join", participantId, name }));
        });

        ps.addEventListener("close", () => setConnected(false));

        ps.addEventListener("message", (event) => {
            const msg = JSON.parse(event.data as string);
            if (msg.type === "state") setRetro(msg.retro as RetroState);
        });

        return () => ps.close();
    }, [code, name]);

    useEffect(() => {
        if (!retro?.timer.running) return;
        setNowTs(Date.now());
        const id = setInterval(() => setNowTs(Date.now()), 500); // Update every 500ms
        return () => clearInterval(id);
    }, [retro?.timer?.running, retro?.timer?.endsAt]);

    const send = (data: unknown) => socketRef.current?.send(JSON.stringify(data));
    const copyInvite = () => {
        navigator.clipboard.writeText(`${location.origin}/retro/${code}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const leave = () => {
        send({ type: "leave" });
        socketRef.current?.close();
        router.push("/");
    };

    const addNote = (column: RetroColumn) => {
        const text = drafts[column].trim();
        if (!text) return;
        send({ type: "addNote", column, text });
        setDrafts((prev) => ({ ...prev, [column]: "" }));
    }

    const submitName = () => {
        const n = gateName.trim();
        if (!n) return;
        sessionStorage.setItem("pp:retroName", n);
        setName(n);
    }

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
                                There&apos;s no active retro with code <strong>{code}</strong>. Double-check
                                the link, or start a fresh session.
                            </p>
                            <button className="pp-btn pp-btn-primary" onClick={() => router.push("/")}>
                                Back to home →
                            </button>
                        </div>
                    ) : gate === "prompt" ? (
                        <div className="pp-gate-card">
                            <div className="pp-gate-code">
                                <span className="pp-room-label">Joining retro</span>
                                <span className="pp-room-code">{code}</span>
                            </div>
                            <h2>What should we call you?</h2>
                            <p className="pp-panel-sub">Your teammates will see this name at the retro.</p>
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
                                Join retro →
                            </button>
                        </div>
                    ) : (
                        <p className="pp-empty">Checking retro...</p>
                    )}
                </div>
            </div>
        );
    }

    if (!retro) {
        return (
            <div className="pp" style={{ display: "grid", placeItems: "center" }}>
                <p className="pp-empty">{connected ? "Loading board..." : "Connecting..."}</p>
            </div>
        )
    }

    const timer = retro.timer ?? { running: false, endsAt: null, remainingMs: 0, durationMs: 300000 };
    const remainingMs = timer.running && timer.endsAt
        ? Math.max(0, timer.endsAt - nowTs)
        : timer.remainingMs;
    
    const timeUp = timer.running && remainingMs === 0;

    const fmtTime = (ms: number) => {
        const s = Math.ceil(ms / 1000);
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    }

    const totalMs = timer.durationMs || 300000;
    const isIdleTimer = !timer.running && timer.remainingMs === 0;
    const elapsedMs = Math.min(totalMs, Math.max(0, totalMs - remainingMs));
    const ringDeg = isIdleTimer ? 0 : timeUp ? 360 : (elapsedMs / totalMs) * 360;

    return (
        <div className="pp">
            <div className="pp-dealer-rail">
                <div className="pp-dealer-rail-left">
                    <div className="pp-dealer-brand">
                        <span className="pp-dealer-brand-suit">♠</span>Pointing Poker
                    </div>
                    <div className="pp-dealer-divider" />
                    <div className="pp-dealer-room">
                        <span className="pp-dealer-label">Table</span>
                        <span className="pp-dealer-code">{code}</span>
                        <button className="pp-icon-btn pp-dealer-copy" onClick={copyInvite} title="Copy invite">
                            <CopyIcon />
                        </button>
                        <span className={`pp-copied-tag${copied ? " pp-show" : ""}`}>Copied!</span>
                    </div>
                </div>

                <div className="pp-dealer-rail-center">
                    <div className="pp-dealer-ring">
                        <div
                            className="pp-dealer-ring-fill"
                            style={{ background: `conic-gradient(var(--ember) 0deg ${ringDeg}deg, var(--bg-panel-2) ${ringDeg}deg 360deg)` }}
                        />
                        <div className={`pp-dealer-ring-face${timeUp ? " pp-timer-up" : ""}`}>
                            {timeUp ? "Up!" : fmtTime(remainingMs)}
                        </div>
                    </div>

                    <div className="pp-dealer-timer-meta">
                        <span className="pp-dealer-label">Round timer</span>
                        <div className="pp-dealer-presets">
                            {[1, 2, 5, 10].map((m) => (
                                <button
                                    key={m}
                                    className={`pp-dealer-preset${timer.durationMs === m * 60 * 1000 ? " pp-active" : ""}`}
                                    onClick={() => send({ type: "startTimer", durationMs: m * 60 * 1000 })}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pp-dealer-timer-controls">
                        <button
                            className="pp-icon-btn"
                            title={timer.running ? "Pause" : "Start"}
                            onClick={() => send(timer.running ? { type: "pauseTimer" } : { type: "startTimer" })}
                        >
                            {timer.running ? <PauseIcon /> : <PlayIcon />}
                        </button>
                        <button
                            className="pp-icon-btn"
                            title="Reset"
                            onClick={() => send({ type: "resetTimer" })}
                        >
                            <ResetIcon />
                        </button>
                    </div>
                </div>

                <div className="pp-dealer-rail-right">
                    <span className="pp-dealer-status">
                        <span className={`pp-live-dot${connected ? "" : " pp-dim"}`}>●</span>
                        {connected ? "Live" : "Reconnecting…"}
                    </span>
                    <button className="pp-btn pp-btn-danger pp-dealer-leave" onClick={leave}>
                        Leave
                    </button>
                </div>
            </div>

            <h2 className="pp-retro-title">Sprint Retro</h2>
            <div className="pp-retro-table">
                <div className="pp-retro-board">
                    {COLUMNS.map(({ key, title, icon: Icon }) => {
                        const notes = [...(retro.columns[key] ?? [])].sort((a, b) => b.votes - a.votes);
                        const topVotes = notes[0]?.votes ?? 0;

                        return (
                            <div className="pp-retro-col" key={key}>
                                <div className="pp-retro-col-header">
                                    <span className="pp-retro-icon"><Icon /></span>
                                    <h3>{title}</h3>
                                    <span className="pp-retro-count">{String(notes.length).padStart(2, "0")}</span>
                                </div>

                                <div className="pp-retro-compose">
                                    <textarea
                                        placeholder="Deal a note…"
                                        value={drafts[key]}
                                        onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                addNote(key);
                                            }
                                        }}
                                    />
                                    <button className="pp-btn pp-btn-primary" onClick={() => addNote(key)}>
                                        Add
                                    </button>
                                </div>

                                <div className="pp-retro-notes">
                                    {notes.length === 0 ? (
                                        <p className="pp-empty">No notes yet</p>
                                    ) : (
                                        notes.map((note, i) => {
                                            const isTop = i === 0 && topVotes > 0;
                                            return (
                                                <div
                                                    className={`pp-retro-note${isTop ? " pp-top-pick" : ""}`}
                                                    key={note.id}
                                                    style={{ transform: `rotate(${noteRotation(note.id)}deg)` }}
                                                >
                                                    {isTop && <span className="pp-retro-pin" />}
                                                    <p className="pp-retro-note-text">{note.text}</p>
                                                    <div className="pp-retro-note-footer">
                                                        <div className="pp-retro-note-author">
                                                            <span className="pp-avatar-chip">{initials(note.author)}</span>
                                                            {note.author}
                                                        </div>
                                                        <button
                                                            className="pp-chip-vote"
                                                            onClick={() => send({ type: "upvote", id: note.id, column: key })}
                                                        >
                                                            <span className="pp-chip-behind-2" />
                                                            <span className="pp-chip-behind-1" />
                                                            <span className="pp-chip-front">{note.votes}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
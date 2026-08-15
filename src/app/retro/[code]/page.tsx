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

const COLUMNS: {key: RetroColumn, title: string}[] = [
    { key: "well", title: "😊 Went well" },
    { key: "improve", title: "🤔 To improve" },
    { key: "action", title: "✅ Action items" },
];

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

    return (
        <div className="pp">
            <div className="pp-room-bar">
                <div className="pp-room-id">
                    <span className="pp-room-label">Room</span>
                    <span className="pp-room-code">{code}</span>
                    <button className="pp-icon-btn" onClick={copyInvite}>
                        <CopyIcon />
                    </button>
                    <span className={`pp-copied-tag${copied ? " pp-show" : ""}`}>Copied!</span>
                </div>
                <div className="pp-room-controls">
                    <span className="pp-room-timer">
                        {connected ? (
                            <>
                                <span className="pp-live-dot">●</span> Live
                            </>
                        ) : (
                            "○ Reconnecting…"
                        )}
                    </span>
                    <button className="pp-btn pp-btn-danger" onClick={leave}>
                        Leave
                    </button>
                </div>
            </div>

            <h2 className="pp-retro-title">Sprint Retro</h2>
            <div className="pp-retro-board">
                {COLUMNS.map(({ key, title }) => {
                    const notes = [...(retro.columns[key] ?? [])].sort((a, b) => b.votes - a.votes);
                    return (
                        <div className="pp-retro-col" key={key}>
                            <h3>{title}</h3>
                            <div className="pp-retro-compose">
                                <textarea
                                    placeholder="Add a note…"
                                    value={drafts[key]}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            addNote(key);
                                        }
                                    }}
                                />
                                <button className="pp-btn pp-btn-outline" onClick={() => addNote(key)}>
                                    Add
                                </button>
                            </div>

                            <div className="pp-retro-notes">
                                {notes.length === 0 ? (
                                    <p className="pp-empty">No notes yet</p>
                                ) : (
                                    notes.map((note) => (
                                        <div className="pp-retro-note" key={note.id}>
                                            <div>
                                                <div className="pp-retro-note-text">{note.text}</div>
                                                <div className="pp-retro-note-author">{note.author}</div>
                                            </div>

                                            <button className="pp-upvote" onClick={() => send({ type: "upvote", id: note.id, column: key })}>
                                                <span className="pp-upvote-count">{note.votes}</span>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
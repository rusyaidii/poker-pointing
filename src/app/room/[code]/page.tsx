"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartySocket } from "partysocket";
import { PARTY_HOST } from "@/lib/party";
import { getOrCreatePid } from "@/lib/room";
import { type RoomState } from "../../../../party/server";

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const router = useRouter();
    const socketRef = useRef<PartySocket | null>(null);
    const [room, setRoom] = useState<RoomState | null>(null);
    const [connected, setConnected] = useState(false);
    const [me, setMe] = useState("");

    useEffect(() => {
        const name = sessionStorage.getItem("pp:name");
        if (!name) {
            router.replace("/");
            return;
        }

        const participantId = getOrCreatePid();
        setMe(participantId);

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

    const send = (data: unknown) => socketRef.current?.send(JSON.stringify(data));
    const copyInvite = () => navigator.clipboard.writeText(`${location.origin}/room/${code}`);

    const leave = () => {
        send({ type: "leave" });
        socketRef.current?.close();
        router.push("/");
    }

    if (!room) {
        return (
            <div className="min-h-screen bg-bg text-text font-body grid place-items-center">
                <p className="text-text-dim">{connected ? "Loading room…" : "Connecting…"}</p>
            </div>
        );
    }

    const participants = Object.entries(room.participants);

    return (
        <div className="min-h-screen bg-bg text-text font-body">
            <div className="flex items-center justify-between px-7 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-text dim">Room</span>
                    <span className="font-mono font-bold text-lg bg-panel border border-border px-2.5 py-1 rounded-md">
                        {room.code}
                    </span>
                    <button className="text-xs text-gold hover:underline" onClick={copyInvite}>
                        Copy Invite Link
                    </button>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <span className="text-text-dim font-mono text-xs">{connected ? "● Live" : "○ Reconnecting…"}</span>
                    <button className="text-text-dim hover:text-text" onClick={leave}>
                        Leave
                    </button>
                </div>
            </div>

            <div className="max-w-[1120px] mx-auto px-7 py-8">
                <h1 className="font-display text-2xl mb-1">{room.storyTitle}</h1>
                <p className="text-text-dim text-sm mb-6">
                    Round {room.round} · {participants.length} in the room
                </p>

                <div className="flex flex-wrap gap-4 mb-8">
                    {participants.map(([pid, p]) => {
                        const voted = pid in room.votes;
                        const cls = room.revealed && voted
                            ? "bg-card-face text-card-face-text border-border"
                            : voted
                            ? "bg-felt border-felt-2"
                            : "bg-panel-2 border-border";
                        return (
                            <div key={pid} className="flex flex-col items-center gap-2 w-24">
                                <div className={`w-16 h-24 rounded-lg border-2 grid place-items-center font-mono font-bold text-xl ${cls}`}>
                                    {room.revealed && voted ? room.votes[pid] : voted ? "✓": ""}
                                </div>
                                <span className="text-xs text-text-dim truncate max-w-24">
                                    {p.name}
                                    {pid === me ? " (You)" : ""}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/** */}
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-text-dim font-mono mr-2">
                        Test:
                    </span>
                    {["1", "2", "3", "5", "8"].map((v) => (
                        <button
                            key={v}
                            className="w-12 h-16 rounded-lg bg-card-face text-card-face-text font-mono font-bold border-2 border-border hover:-translate-y-1 transition"
                            onClick={() => send({ type: "vote", value: v })}
                        >
                            {v}
                        </button>
                    ))}
                    <button
                        className="ml-4 px-4 py-2 rounded-lg bg-ember text-white font-semibold"
                        onClick={() => send({ type: "reveal" })}
                    >
                        Reveal
                    </button>
                    <button
                        className="px-4 py-2 rounded-lg border border-border"
                        onClick={() => send({ type: "newRound" })}
                    >
                        New Round
                    </button>
                </div>
            </div>

        </div>
    )
}
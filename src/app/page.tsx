"use client";

import { randCode } from "@/lib/room";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DeckType } from "../../party/server";
import { roomExists } from "@/lib/party";

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

const FEATURES = [
  { title: "Auto-reveal", body: "Cards flip the moment the last vote lands — no one has to ask “is everyone in?”" },
  { title: "Consensus check", body: "Instant agreement gets called out; split votes highlight the high and low outliers to discuss first." },
  { title: "Round history & export", body: "Every story and its final estimate stays logged for the session — copy it straight into your ticket." },
  { title: "Spectator mode", body: "POs and stakeholders can watch without a vote skewing the average." },
  { title: "Five deck types", body: "Fibonacci, modified Fibonacci, powers of two, sequential, or T-shirt sizes — pick per session." },
  { title: "Keyboard voting", body: "Press 1–9 to throw a card without touching the mouse." },
  { title: "Retro boards", body: "Went well, to improve, action items — same room code, same team." },
  { title: "No signup, ever", body: "Share a six-character code and start pointing in seconds." },
];

export default function Home() {
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [createName, setCreateName] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDeck, setCreateDeck] = useState<DeckType>("fibonacci");
  const [createError, setCreateError] = useState("");

  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const [retroName, setRetroName] = useState("");
  const [retroJoinCode, setRetroJoinCode] = useState("");
  const [retroError, setRetroError] = useState("");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  const startSession = async () => {
    if (!createName.trim()) {
      setCreateError("Please enter your name");
      return;
    }

    sessionStorage.setItem("pp:name", createName.trim());
    sessionStorage.setItem("pp:deck", createDeck);

    if (createTitle.trim()) sessionStorage.setItem("pp:story", createTitle.trim());
    else sessionStorage.removeItem("pp:story");

    router.push(`/room/${randCode()}`);
  }

  const joinSession = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!joinName.trim() || !code) {
      setJoinError("Please enter your name and room code");
      return;
    }

    setJoinError("");
    if (!(await roomExists("room", code))) {
      setJoinError("Room not found. Please check the code and try again.");
      return;
    }

    sessionStorage.setItem("pp:name", joinName.trim());
    sessionStorage.removeItem("pp:deck");
    sessionStorage.removeItem("pp:story");
    router.push(`/room/${code}`);
  }

  const createRetro = () => {
    if (!retroName.trim()) {
      setRetroError("Enter your name to start a retro.");
      return;
    }

    sessionStorage.setItem("pp:retroName", retroName.trim());
    router.push(`/retro/${randCode()}`);
  }

  const joinRetro = async () => {
    const code = retroJoinCode.trim().toUpperCase();
    if (!retroName.trim() || !code) {
      setRetroError("Enter your name and room code to join a retro.");
      return;
    }

    setRetroError("");
    if (!(await roomExists("retro", code))) {
      setRetroError("Retro not found. Please check the code and try again.");
      return;
    }

    sessionStorage.setItem("pp:retroName", retroName.trim());
    router.push(`/retro/${code}`);
  }

  return (
    <div className="pp">
      <div className="pp-topbar">
        <div className="pp-brand">
          <span className="pp-brand-suit">♠</span>Pointing Poker
        </div>
        <button className="pp-icon-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <div className="pp-inner">
        {/* hero */}
        <div className="pp-hero">
          <div>
            <p className="pp-eyebrow">Free · No signup · Real-time</p>
            <h1>
              Estimate together.
              <br />
              Ship with confidence.
            </h1>
            <p className="pp-hero-sub">
              Planning poker for distributed dev teams. Deal a hand, reveal together, and turn debate
              into a number everyone can stand behind — synced live across everyone with the room code.
            </p>
          </div>
          <div className="pp-hero-stage" aria-hidden="true">
            <div className="pp-fan-card f1" />
            <div className="pp-fan-card f2" />
            <div className="pp-fan-card f3" />
            <div className="pp-fan-card f4" />
            <div className="pp-flip-card">
              <div className="pp-flip-face pp-back" />
              <div className="pp-flip-face pp-front">8</div>
            </div>
          </div>
        </div>

        {/* create / join table */}
        <div className="pp-table">
          <div className="pp-panel">
            <h2>Start a pointing session</h2>
            <p className="pp-panel-sub">Deal a fresh table and invite your team.</p>
            <label>Your name</label>
            <input
              type="text"
              placeholder="e.g. Aizat"
              maxLength={24}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startSession()}
            />
            <label>Story or ticket (optional)</label>
            <input
              type="text"
              placeholder="e.g. JIRA-482 Refund flow"
              maxLength={80}
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startSession()}
            />
            <label>Estimation deck</label>
            <select>
              <option value="fibonacci">Fibonacci — 0 1 2 3 5 8 13 21 34 55 89</option>
              <option value="modified">Modified Fibonacci — 0 ½ 1 2 3 5 8 13 20 40 100</option>
              <option value="powers2">Powers of 2 — 0 1 2 4 8 16 32 64</option>
              <option value="sequential">Sequential — 1 to 10</option>
              <option value="tshirt">T-shirt sizes — XS S M L XL XXL</option>
            </select>
            <button className="pp-btn pp-btn-primary" onClick={startSession}>
              Deal me in →
            </button>
            <p className="pp-error">{createError}</p>
          </div>
          <div className="pp-seam" />
          <div className="pp-panel">
            <h2>Join a session</h2>
            <p className="pp-panel-sub">Already got a table code from a teammate?</p>
            <label>Your name</label>
            <input
              type="text"
              placeholder="e.g. Aizat" maxLength={24}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinSession()}
            />
            <label>Room code</label>
            <input
              type="text"
              placeholder="e.g. 7F3KQ2"
              maxLength={8}
              style={{ textTransform: "uppercase" }}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinSession()}
              />
            <button className="pp-btn pp-btn-outline" onClick={joinSession}>
              Join table →
            </button>
            <p className="pp-error">{joinError}</p>
          </div>
        </div>

        {/* retro cta */}
        <div className="pp-retro-cta">
          <div>
            <h2>Running a retro instead?</h2>
            <p>
              Spin up a three-column retro board — went well, to improve, action items — with the same
              room-code flow.
            </p>
          </div>
          <div className="pp-retro-actions">
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Your name"
                maxLength={24}
                value={retroName}
                onChange={(e) => setRetroName(e.target.value)}
              />
              <button className="pp-btn pp-btn-primary" onClick={createRetro}>Start a retro →</button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Room code"
                maxLength={8}
                value={retroJoinCode}
                onChange={(e) => setRetroJoinCode(e.target.value)}
              />
              <button className="pp-btn pp-btn-outline" onClick={joinRetro}>Join</button>
            </div>
            <p className="pp-error" style={{ width: "100%" }}>{retroError}</p>
          </div>
        </div>

        {/* features */}
        <div className="pp-features">
          <h2>Built for how dev teams actually estimate</h2>
          <div className="pp-feature-grid">
            {FEATURES.map((f) => (
              <div className="pp-feature" key={f.title}>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="pp-footer">
          <p>Pointing Poker — built for teams who&apos;d rather estimate than argue about estimating.</p>
        </div>
      </div>
    </div>
  );
}
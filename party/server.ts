import { routePartykitRequest, Server, type Connection } from "partyserver";

export type DeckType =
    | "fibonacci"
    | "modified"
    | "powers2"
    | "sequential"
	| "tshirt";

export type RoomLayout = "table" | "normal";

export interface Participant {
	name: string;
	isSpectator: boolean;
	joinedAt: number;
}

export interface HistoryEntry {
	round: number;
	title: string;
	average: number | null;
	consensus: boolean;
	spread: string;
	endedAt: number;
	votes?: { name: string; value: string }[]; // optional: rounds saved before this field existed lack it
}

export interface RoomState {
	code: string;
	deckType: DeckType;
	layout: RoomLayout;
	storyTitle: string;
	revealed: boolean;
	autoReveal: boolean;
	round: number;
	roundStartedAt: number;
	participants: Record<string, Participant>;
	votes: Record<string, string>;
	history: HistoryEntry[];
	createdAt: number;
}

type ClientMessage =
	| { type: "join"; participantId: string; name: string; isSpectator?: boolean; initDeck?: DeckType; initStory?: string; initLayout?: RoomLayout }
	| { type: "vote"; value: string }
	| { type: "reveal" }
	| { type: "newRound" }
	| { type: "setStory"; title: string }
	| { type: "setDeck"; deckType: DeckType }
	| { type: "setAutoReveal"; value: boolean }
	| { type: "setSpectator"; value: boolean }
	| { type: "setLayout"; value: RoomLayout }
	| { type: "leave" };

export type RetroColumn = "well" | "improve" | "action";

export interface RetroNote {
	id: string;
	text: string;
	votes: number;
	author: string;
	createdAt: number;
}

export interface RetroTimer {
	running: boolean;
	endsAt: number | null;
	remainingMs: number;
	durationMs: number;
}

export interface RetroState {
	code: string;
	participants: Record<string, { name: string; joinedAt: number }>;
	columns: Record<RetroColumn, RetroNote[]>;
	timer: RetroTimer;
	createdAt: number;
}

const DEFAULT_TIMER: RetroTimer = {
	running: false,
	endsAt: null,
	remainingMs: 0,
	durationMs: 5 * 60 * 1000, // 5 minutes
}

type RetroMessage =
	| { type: "join"; participantId: string; name: string; }
	| { type: "addNote"; column: RetroColumn; text: string }
	| { type: "upvote"; column: RetroColumn; id: string }
	| { type: "startTimer"; durationMs?: number }
	| { type: "pauseTimer" }
	| { type: "resetTimer" }
	| { type: "leave" };

interface Env extends Cloudflare.Env {
    Room: DurableObjectNamespace;
	Retro: DurableObjectNamespace;
}

const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // dead rooms self-clean after 24h

function numericValue(v: string): number | null {
    if (v === "½") return 0.5;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

const isNumericDeck = (d: DeckType) => d !== "tshirt";

export class Room extends Server<Env> {
	static options = { hibernate: true }; // sleep while idle, keep sockets open = cheap
	
	state!: RoomState;

	async onStart() {
		const saved = await this.ctx.storage.get<RoomState>("room");
		this.state = saved ?? {
			code: this.name,
			deckType: "fibonacci",
			layout: "table",
			storyTitle: "What are we estimating?",
			revealed: false,
			autoReveal: true,
			round: 1,
			roundStartedAt: Date.now(),
			participants: {},
			votes: {},
			history: [],
			createdAt: Date.now(),
		};
	}

	async onRequest(): Promise<Response> {
		const saved = await this.ctx.storage.get<RoomState>("room");
		return Response.json(
			{ exists: !!saved },
			{ headers: { "Access-Control-Allow-Origin": "*" } },
		);
	}

	onConnect(conn: Connection) {
		conn.send(JSON.stringify({ type: "state", room: this.state }));
	}

	async onMessage(conn: Connection, raw: string | ArrayBuffer) {
		if (typeof raw !== "string") return;
		let msg: ClientMessage;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}

		const state = this.state;

		switch (msg.type) {
			case "join": {
				// Check if the participant is the creator (first to join)
				const isCreator = Object.keys(state.participants).length === 0;
				if (isCreator) {
					if (msg.initDeck) state.deckType = msg.initDeck;
					if (msg.initStory) state.storyTitle = msg.initStory;
					if (msg.initLayout === "table" || msg.initLayout === "normal") state.layout = msg.initLayout;
				}

				// Add participant to participants map
				state.participants[msg.participantId] = {
					name: msg.name,
					isSpectator: msg.isSpectator ?? false,
					joinedAt: Date.now(),
				};

				// Update connection state with participant ID
				conn.setState({ participantId: msg.participantId });
				break;
			}

			case "vote": {
				const pid = this.pid(conn); // Get participant ID from connection state
				if (!pid || state.revealed) break; // If no participant ID or room is revealed, break

				const me = state.participants[pid]; // Get participant object from participants map
				if (!me || me.isSpectator) break; // If participant is not found or is a spectator, break

				state.votes[pid] = msg.value; // Store vote in votes map

				// If auto-reveal is enabled, check if all active participants have voted
				if (state.autoReveal) {
					const active = Object.entries(state.participants)
						.filter(([, p]) => !p.isSpectator)
						.map(([id]) => id);

					// Check if all active participants have voted
					if (active.length > 0 && active.every((id) => id in state.votes)) state.revealed = true;
				}
				
				break;
			}

			case "reveal": {
				state.revealed = true;
				break;
			}

			case "newRound": {
				if (Object.keys(state.votes).length > 0) state.history.unshift(this.buildHistory());
				state.votes = {};
				state.revealed = false;
				state.round += 1;
				state.roundStartedAt = Date.now();
				break;
			}

			case "setStory": {
				state.storyTitle = msg.title || "What are we estimating?";
				break;
			}

			case "setDeck": {
				state.deckType = msg.deckType;
				state.votes = {};
				state.revealed = false;
				state.roundStartedAt = Date.now();
				break;
			}

			case "setAutoReveal": {
				state.autoReveal = msg.value;
				break;
			}

			case "setLayout": {
				if (msg.value === "table" || msg.value === "normal") state.layout = msg.value;
				break;
			}

			case "setSpectator": {
				const pid = this.pid(conn);
				if (!pid) break;
				if (state.participants[pid]) state.participants[pid].isSpectator = msg.value; 
				if (msg.value) delete state.votes[pid];
				break;
			}

			case "leave": {
				const pid = this.pid(conn);
				if (pid) {
					delete state.participants[pid];
					delete state.votes[pid];
				}
				break;
			}
		}

		await this.save();
		this.broadcastState();
	}

	onClose(conn: Connection) {
		const pid = this.pid(conn);
		if (!pid || !this.state) return;
		delete this.state.participants[pid]; // Remove participant from participants map
		delete this.state.votes[pid]; // Remove participant's vote from votes map
		void this.save();
		this.broadcastState();
	}

	async onAlarm() {
		// TTL cleanup: wipe an abandoned room's storage if nobody is connected
		const empty = [...this.getConnections()].length === 0;
		if (empty) {
			await this.ctx.storage.deleteAll();
		}
	}

	private pid(conn: Connection): string | null {
		const state = conn.state as { participantId?: string } | null;
		return state?.participantId ?? null;
	}

	private broadcastState() {
		this.broadcast(JSON.stringify({ type: "state", room: this.state }));
	}

	private async save() {
		await this.ctx.storage.put("room", this.state);
		await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
	}

	private buildHistory(): HistoryEntry {
		const state = this.state;
		const vals = Object.values(state.votes);
		const consensus = vals.length > 1 && vals.every(v => v === vals[0]); // If there are more than 1 vote and all votes are the same, then there is consensus
		let average: number | null = null;
		let spread = "";

		if (isNumericDeck(state.deckType)) {
			const nums = vals.map(numericValue).filter((v): v is number => v !== null); // Filter out any null values
			if (nums.length) {
				average = nums.reduce((a, b) => a + b, 0) / nums.length;
				spread = `${Math.min(...nums)} - ${Math.max(...nums)}`;
			}
		}

		return {
			round: state.round,
			title: state.storyTitle,
			average,
			consensus,
			spread,
			endedAt: Date.now(),
			votes: Object.entries(state.votes).map(([pid, value]) => ({
				name: state.participants[pid]?.name ?? "Unknown",
				value,
			})),
		}
	}
}

export class Retro extends Server<Env> {
	static options = { hibernate: true }; // sleep while idle, keep sockets open = cheap

	state!: RetroState;

	async onStart() {
		const saved = await this.ctx.storage.get<RetroState>("retro");
		this.state = saved ?? {
			code: this.name,
			participants: {},
			columns: {
				well: [],
				improve: [],
				action: [],
			},
			timer: { ...DEFAULT_TIMER },
			createdAt: Date.now(),
		}
	}

	async onRequest(): Promise<Response> {
		const saved = await this.ctx.storage.get<RetroState>("retro");
		return Response.json(
			{ exists: !!saved },
			{ headers: { "Access-Control-Allow-Origin": "*" } },
		);
	}

	async onConnect(conn: Connection) {
		conn.send(JSON.stringify({ type: "state", retro: this.state }));
	}

	async onMessage(conn: Connection, raw: string | ArrayBuffer) {
		if (typeof raw !== "string") return;
		let msg: RetroMessage;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}

		const state = this.state;

		switch (msg.type) {
			case "join": {
				state.participants[msg.participantId] = { name: msg.name, joinedAt: Date.now() };
				conn.setState({ participantId: msg.participantId, name: msg.name });
				break;
			}

			case "addNote": {
				const text = msg.text.trim();
				if (!text) break;
				const author = (conn.state as { name?: string } | null)?.name ?? "";
				state.columns[msg.column].push({
					id: crypto.randomUUID(),
					text,
					votes: 0,
					author,
					createdAt: Date.now(),
				});
				break;
			}

			case "upvote": {
				const note = state.columns[msg.column].find((n) => n.id === msg.id);
				if (note) note.votes += 1;
				break;
			}

			case "startTimer": {
				const t = state.timer;
			
				// Start a new duration if one was provided.
				if (typeof msg.durationMs === "number" && msg.durationMs > 0) {
					t.durationMs = msg.durationMs;
					t.remainingMs = msg.durationMs;
				}
			
				// Resume from remaining time, or start from the full duration.
				const base = t.remainingMs > 0 ? t.remainingMs : t.durationMs;
			
				if (base <= 0) return;
			
				t.remainingMs = base;
				t.endsAt = Date.now() + base;
				t.running = true;
			
				break;
			}

			case "pauseTimer": {
				const t = state.timer;
				if (t.running && t.endsAt) {
					t.remainingMs = Math.max(0, t.endsAt - Date.now());
					t.running = false;
					t.endsAt = null;
				}
				break;
			}

			case "resetTimer": {
				const t = state.timer;
				t.running = false;
				t.endsAt = null;
				t.remainingMs = t.durationMs;
				break;
			}

			case "leave": {
				const pid = (conn.state as { participantId?: string } | null)?.participantId ?? null;
				if (pid) delete state.participants[pid];
				break;
			}
		}

		await this.save();
		this.broadcast(JSON.stringify({ type: "state", retro: this.state }));
	}

	onClose(conn: Connection) {
		const pid = (conn.state as { participantId?: string } | null)?.participantId;
		if (!pid || !this.state) return;
		delete this.state.participants[pid];
		void this.save();
		this.broadcast(JSON.stringify({ type: "state", retro: this.state }));
	}

	async onAlarm() {
		if ([...this.getConnections()].length === 0) {
			await this.ctx.storage.deleteAll();
		}
	}

	private async save() {
		await this.ctx.storage.put("retro", this.state);
		await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return (await routePartykitRequest(request, env)) || new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
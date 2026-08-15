export const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST || "127.0.0.1:1999";

export async function roomExists(
    party: "room" | "retro",
    code: string,
): Promise<boolean> {
    const isLocal = PARTY_HOST.includes("127.") || PARTY_HOST.includes("localhost");
    const protocol = isLocal ? "http" : "https";

    try {
        const res = await fetch(`${protocol}://${PARTY_HOST}/parties/${party}/${code}`);
        if (!res.ok) return false;
        const data = (await res.json()) as { exists: boolean };
        return !!data.exists;
    } catch {
        return false;
    }
}
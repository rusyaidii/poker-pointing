import type { DeckType, RoomState } from "../../party/server";

export const DECKS: Record<DeckType, string[]> = {
    fibonacci: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "☕"],
    modified: ["0", "½", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"],
    powers2: ["0", "1", "2", "4", "8", "16", "32", "64", "?"],
    sequential: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?"],
    tshirt: ["XS", "S", "M", "L", "XL", "XXL", "?"],
};

export const DECK_LABELS: Record<DeckType, string> = {
    fibonacci: "Fibonacci",
    modified: "Modified Fibonacci",
    powers2: "Powers of 2",
    sequential: "Sequential",
    tshirt: "T-Shirt Sizing",
}

/**
 * Converts a string value to a numeric value, or null if the value is not a number.
 * @param v - The string value to convert.
 * @param deck - The deck type to use for conversion.
 * @returns The numeric value, or null if the value is not a number.
 */
export function numericValue(v: string): number | null {
    if (v === "½") return 0.5;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

export const isNumericDeck = (d: DeckType) => d != "tshirt";

export interface Stats {
    consensus: boolean;
    average: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    distribution: { label: string, count: number }[];
}

export function computeStats(room: RoomState): Stats {
    const vals = Object.values(room.votes);
    const consensus = vals.length > 1 && vals.every((v) => v === vals[0]);
    let average: number | null = null;
    let median: number | null = null;
    let min: number | null = null;
    let max: number | null = null;

    if (isNumericDeck(room.deckType)) {
        const nums = vals
            .map((v) => numericValue(v))
            .filter((v): v is number => v !== null)
            .sort((a, b) => a - b);

        if (nums.length) {
            average = nums.reduce((a, b) => a + b, 0) / nums.length;
            median = 
                nums.length % 2
                    ? nums[(nums.length - 1) / 2]
                    : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;
            min = nums[0];
            max = nums[nums.length - 1];
        }
    }

    const counts: Record<string, number> = {};
    vals.forEach((v) => (counts[v] = (counts[v] || 0) + 1)); // Count the occurrences of each value
    // Sort the distribution by count in descending order. Why? Because we want to know the most common value.
    const distribution = (DECKS[room.deckType] || [])
        .filter((c) => counts[c])
        .map((c) => ({ label: c, count: counts[c] }));

    return { consensus, average, median, min, max, distribution };
}
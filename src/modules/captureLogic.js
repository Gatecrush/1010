// src/modules/captureLogic.js
import { getValue, captureValues, combinationValue } from './deck';

export class CaptureValidator {

    /**
     * Finds all valid sets of table items that can be captured by the played card.
     * @param {object} playedCard - The card played from the hand.
     * @param {array} tableItems - Current items on the table (cards, builds, pairs).
     * @returns {array<array<object>>} - An array of valid capture sets. Each set is an array of table items.
     */
    static getValidCaptures(playedCard, tableItems) {
        if (!playedCard || !tableItems) return [];

        const validCaptureSets = [];
        const playedRank = playedCard.rank;
        const playedCaptureValue = captureValues[playedRank]; // Use capture value (A=14 etc)
        const isPlayedCardNumeric = !['J', 'Q', 'K'].includes(playedRank); // Ace is numeric here for value capture

        // --- 1. Capture by Rank (Cards and Pairs) ---
        const rankMatchItems = tableItems.filter(item =>
            (item.type === 'card' && item.rank === playedRank) ||
            (item.type === 'pair' && item.rank === playedRank) // Include pairs matching the rank
        );
        if (rankMatchItems.length > 0) {
            // A single card captures ALL cards AND pairs of the same rank simultaneously
            validCaptureSets.push([...rankMatchItems]);
        }

        // --- 2. Capture by Value (Only for Numeric Cards: 2-10, A) ---
        if (isPlayedCardNumeric) {
            // --- 2a. Capture Builds by Value ---
            const buildMatches = tableItems.filter(item =>
                item.type === 'build' && item.value === playedCaptureValue // Build value must match card's capture value (A=14)
            );
            buildMatches.forEach(build => {
                validCaptureSets.push([build]); // Each matching build is a separate capture option
            });

            // --- 2b. Capture Combinations by Value ---
            // Items eligible for combinations: individual numeric cards (Ace=1) and SIMPLE builds
            // PAIRS CANNOT BE USED IN VALUE COMBINATIONS
            const combinableItems = tableItems.filter(item =>
                (item.type === 'card' && !['J', 'Q', 'K'].includes(item.rank)) || // Numeric cards (A=1)
                (item.type === 'build' && !item.isCompound) // Simple builds only
            );

            if (combinableItems.length > 0) {
                const n = combinableItems.length;
                // Iterate through all possible subsets of combinable items
                for (let i = 1; i < (1 << n); i++) { // Start from 1 to exclude empty set
                    const subset = [];
                    let currentSum = 0;
                    for (let j = 0; j < n; j++) {
                        if ((i >> j) & 1) { // If the j-th item is in the subset
                            const item = combinableItems[j];
                            if (!item.id) { console.error("Combinable item missing ID:", item); continue; }
                            subset.push(item);
                            // Use combination value (Ace=1 for cards, build.value for simple builds)
                            currentSum += (item.type === 'card' ? combinationValue(item.rank) : item.value);
                        }
                    }
                    if (currentSum === playedCaptureValue && subset.length > 0) {
                        validCaptureSets.push(subset);
                    }
                }
            }
        }

        // --- Remove duplicate/subset sets ---
        // Example: If capturing [Card(7)] is valid and capturing [Card(7), Card(3), Card(4)] is valid,
        // keep only the largest valid sets if they share items? Or allow user to choose?
        // Current logic allows capturing just the 7 OR the 7+3+4 if both sum correctly.
        // Let's stick with finding all distinct valid sets first.
        const uniqueSets = [];
        const seenSetSignatures = new Set();

        validCaptureSets.forEach(set => {
            if (set.every(item => item && item.id)) {
                const signature = set.map(item => item.id).sort().join(',');
                if (!seenSetSignatures.has(signature)) {
                    seenSetSignatures.add(signature);
                    uniqueSets.push(set);
                }
            } else {
                console.error("Capture set contains item(s) without ID:", set);
            }
        });

        return uniqueSets;
    }
}

// Helper function to compare if two arrays of items are the same set (order-independent)
export const areItemSetsEqual = (set1, set2) => {
    // ... (areItemSetsEqual function remains unchanged) ...
    if (!set1 || !set2 || set1.length !== set2.length) {
        return false;
    }
    if (!set1.every(item => item && item.id) || !set2.every(item => item && item.id)) {
        console.error("Attempted to compare sets with missing IDs");
        return false;
    }
    const ids1 = set1.map(item => item.id).sort();
    const ids2 = set2.map(item => item.id).sort();
    return ids1.every((id, index) => id === ids2[index]);
};

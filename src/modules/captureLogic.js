// src/modules/captureLogic.js
import { getValue, captureValues, combinationValue } from './deck';

export class CaptureValidator {

    /**
     * Finds all valid sets of table items that can be captured by the played card.
     * Includes rank matches, value matches (A=14), combination sums (A=1),
     * and direct build value matches (A=1).
     * @param {object} playedCard - The card played from the hand.
     * @param {array} tableItems - Current items on the table (cards, builds, pairs).
     * @returns {array<array<object>>} - An array of valid capture sets. Each set is an array of table items.
     */
    static getValidCaptures(playedCard, tableItems) {
        if (!playedCard || !tableItems) return [];

        const validCaptureSets = [];
        const playedRank = playedCard.rank;
        const playedCaptureValue = captureValues[playedRank]; // Value for build capture (A=14, J=11...)
        const playedCombinationValue = combinationValue(playedRank); // Value for sum/direct match (A=1, 2=2...)
        const isPlayedCardNumeric = !['J', 'Q', 'K'].includes(playedRank); // Ace is numeric here

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
            // --- 2a. Capture Builds by Capture Value (A=14, etc.) ---
            const buildCaptureValueMatches = tableItems.filter(item =>
                item.type === 'build' && item.value === playedCaptureValue
            );
            buildCaptureValueMatches.forEach(build => {
                validCaptureSets.push([build]); // Each matching build is a separate capture option
            });

            // --- 2b. Capture by Combination Value (A=1, etc.) ---
            // Items eligible for combinations/direct match: individual numeric cards (Ace=1) and SIMPLE builds
            const combinableItems = tableItems.filter(item =>
                (item.type === 'card' && !['J', 'Q', 'K'].includes(item.rank)) || // Numeric cards (A=1)
                (item.type === 'build' && !item.isCompound) // Simple builds only
            );

            if (combinableItems.length > 0) {
                // --- 2b-i. Direct Build Match (using Combination Value A=1) ---
                const directBuildMatches = combinableItems.filter(item =>
                    item.type === 'build' && item.value === playedCombinationValue
                );
                directBuildMatches.forEach(build => {
                    // Add as a single-item capture set
                    validCaptureSets.push([build]);
                });

                // --- 2b-ii. Capture Combinations Summing to Combination Value (A=1) ---
                const n = combinableItems.length;
                for (let i = 1; i < (1 << n); i++) { // Iterate through all possible subsets
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
                    // Check if the sum matches the played card's combination value (A=1)
                    if (currentSum === playedCombinationValue && subset.length > 0) {
                        // Ensure this exact combination isn't just the direct build match already added
                        // (e.g., don't add subset [Build(7)] if it was added in 2b-i)
                        if (!(subset.length === 1 && subset[0].type === 'build' && subset[0].value === playedCombinationValue)) {
                           validCaptureSets.push(subset);
                        }
                    }
                }
            }
        }

        // --- 3. Remove duplicate/subset sets ---
        const uniqueSets = [];
        const seenSetSignatures = new Set();

        validCaptureSets.forEach(set => {
            // Ensure all items in the set have an ID before creating signature
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
    if (!set1 || !set2 || set1.length !== set2.length) {
        return false;
    }
    // Ensure items have IDs before comparing
    if (!set1.every(item => item && item.id) || !set2.every(item => item && item.id)) {
        console.error("Attempted to compare sets with missing IDs");
        return false; // Cannot compare reliably
    }
    const ids1 = set1.map(item => item.id).sort();
    const ids2 = set2.map(item => item.id).sort();
    return ids1.every((id, index) => id === ids2[index]);
};

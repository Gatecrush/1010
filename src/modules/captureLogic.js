// src/modules/captureLogic.js
import { getValue, captureValues, combinationValue } from './deck'; // combinationValue might be unused now

export class CaptureValidator {

    /**
     * Finds all valid sets of table items that can be captured by the played card.
     * Includes rank matches (cards/pairs), build captures (by targetRank),
     * and combination sums (using captureValues).
     * @param {object} playedCard - The card played from the hand.
     * @param {array} tableItems - Current items on the table (cards, builds, pairs).
     * @returns {array<array<object>>} - An array of valid capture sets. Each set is an array of table items.
     */
    static getValidCaptures(playedCard, tableItems) {
        if (!playedCard || !tableItems) return [];

        const validCaptureSets = [];
        const playedRank = playedCard.rank;
        const playedCaptureValue = captureValues[playedRank]; // Value for combination sums (A=14, J=11...)
        // const playedCombinationValue = combinationValue(playedRank); // Value for sum/direct match (A=1, 2=2...) - Less relevant now for builds

        // --- 1. Capture by Rank (Cards and Pairs) ---
        const rankMatchItems = tableItems.filter(item =>
            item && item.id && // Ensure item exists and has ID
            ((item.type === 'card' && item.rank === playedRank) ||
             (item.type === 'pair' && item.rank === playedRank))
        );
        if (rankMatchItems.length > 0) {
            // A single card captures ALL loose cards AND pairs of the same rank simultaneously
            validCaptureSets.push([...rankMatchItems]);
        }

        // --- 2. Capture Builds by Target Rank Match ---
        // This is the primary way to capture builds.
        const buildRankMatches = tableItems.filter(item =>
            item && item.id &&
            item.type === 'build' &&
            item.targetRank === playedRank // Check if build's targetRank matches played card's rank
        );
        // Each matching build is a *separate* capture option initially.
        // The multi-capture logic in turns.js will handle selecting multiple.
        buildRankMatches.forEach(build => {
            validCaptureSets.push([build]); // Add each build as an individual capture set
        });

        // --- 3. Capture Combinations by Sum (Using Capture Value: A=14, J=11...) ---
        // This applies only to combining *loose cards* on the table. Builds/Pairs are not included here.
        const combinableCards = tableItems.filter(item =>
            item && item.id &&
            item.type === 'card' && // Only cards
            !isFaceCard(item) // Exclude J, Q, K from sums (though their captureValues exist)
                               // Ace (A=14) *can* be used in sums if needed by ruleset
                               // Let's stick to numeric cards 2-10 + A for sums for now.
                               // Re-evaluate if J/Q/K sums are needed.
                               // Using captureValues map for consistency (A=14).
        );

        if (combinableCards.length > 0) {
            const n = combinableCards.length;
            for (let i = 1; i < (1 << n); i++) { // Iterate through all non-empty subsets
                const subset = [];
                let currentSum = 0;
                for (let j = 0; j < n; j++) {
                    if ((i >> j) & 1) {
                        const item = combinableCards[j];
                        subset.push(item);
                        // Use captureValues for summing combinations
                        currentSum += captureValues[item.rank] || 0; // Use map, default to 0 if somehow invalid
                    }
                }
                // Check if the subset sum matches the played card's capture value
                if (currentSum === playedCaptureValue && subset.length > 0) {
                    validCaptureSets.push(subset);
                }
            }
        }

        // --- 4. Remove duplicate sets (based on item IDs) ---
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
                // This should not happen if filtering above is correct
                console.error("Capture set generation error: item missing ID in final set:", set);
            }
        });

        // console.log("Generated Valid Captures for", playedCard.suitRank, ":", uniqueSets.map(s => s.map(i => i.id || i.suitRank))); // Debug Log
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

// Helper function (can be moved or kept here)
const isFaceCard = (card) => {
    if (!card || !card.rank) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
};

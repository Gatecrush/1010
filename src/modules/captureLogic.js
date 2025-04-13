// src/modules/captureLogic.js
import { getValue, captureValues, combinationValue } from './deck';

export class CaptureValidator {

    /**
     * Finds all valid sets of table items that can be captured by the played card.
     * Ensures builds are validated based on their 'value' property.
     * @param {object} playedCard - The card played from the hand.
     * @param {array} tableItems - Current items on the table (cards, builds, pairs).
     * @returns {array<array<object>>} - An array of valid capture sets. Each set is an array of table items.
     */
    static getValidCaptures(playedCard, tableItems) {
        // Basic validation
        if (!playedCard || !playedCard.rank || !tableItems || !Array.isArray(tableItems)) {
            console.error("Invalid input to getValidCaptures");
            return [];
        }

        const validCaptureSets = [];
        const playedRank = playedCard.rank;
        const playedCaptureValue = captureValues[playedRank]; // Value for build capture (A=14, J=11...)
        const playedCombinationValue = combinationValue(playedRank); // Value for sum/direct match (A=1, 2=2...)
        const isPlayedCardNumeric = !['J', 'Q', 'K'].includes(playedRank); // Ace is numeric here

        // Filter out invalid items from tableItems early
        const validTableItems = tableItems.filter(item => item && item.id && item.type);

        // --- 1. Capture by Rank (Cards and Pairs) ---
        const rankMatchItems = validTableItems.filter(item =>
            ((item.type === 'card' && item.rank === playedRank) ||
             (item.type === 'pair' && item.rank === playedRank))
        );
        if (rankMatchItems.length > 0) {
            validCaptureSets.push([...rankMatchItems]);
        }

        // --- 2. Capture by Value (Only for Numeric Cards: 2-10, A) ---
        if (isPlayedCardNumeric) {
            // --- 2a. Capture Builds by Capture Value (A=14, etc.) ---
            // Ensure build has a numeric value before comparing
            const buildCaptureValueMatches = validTableItems.filter(item =>
                item.type === 'build' && typeof item.value === 'number' &&
                item.value === playedCaptureValue
            );
            buildCaptureValueMatches.forEach(build => {
                validCaptureSets.push([build]);
            });

            // --- 2b. Capture by Combination Value (A=1, etc.) ---
            // Ensure items are valid and have necessary properties
            const combinableItems = validTableItems.filter(item =>
                (item.type === 'card' && item.rank && !['J', 'Q', 'K'].includes(item.rank)) ||
                (item.type === 'build' && !item.isCompound && typeof item.value === 'number')
            );

            if (combinableItems.length > 0) {
                // --- 2b-i. Direct Build Match (using Combination Value A=1) ---
                // Check build value against played card's combination value
                const directBuildMatches = combinableItems.filter(item =>
                    item.type === 'build' && // Already checked value is number
                    item.value === playedCombinationValue
                );
                directBuildMatches.forEach(build => {
                    validCaptureSets.push([build]);
                });

                // --- 2b-ii. Capture Combinations Summing to Combination Value (A=1) ---
                const n = combinableItems.length;
                for (let i = 1; i < (1 << n); i++) {
                    const subset = [];
                    let currentSum = 0;
                    let subsetIsValid = true; // Flag to track validity within subset loop

                    for (let j = 0; j < n; j++) {
                        if ((i >> j) & 1) {
                            const item = combinableItems[j];
                            let itemVal = 0;
                            // Get item value, ensuring properties exist
                            if (item.type === 'card') {
                                itemVal = combinationValue(item.rank);
                            } else if (item.type === 'build') { // Already checked it's simple & has value
                                itemVal = item.value;
                            }

                            if (typeof itemVal !== 'number') {
                                console.error("Error getting value for item in combination:", item);
                                subsetIsValid = false;
                                break; // Invalid item in subset
                            }
                            subset.push(item);
                            currentSum += itemVal;
                        }
                    }

                    if (!subsetIsValid) continue; // Skip this subset if an item was invalid

                    // Check if the sum matches the played card's combination value (A=1)
                    if (currentSum === playedCombinationValue && subset.length > 0) {
                        // Avoid adding subset if it's just the direct build match already added
                        if (!(subset.length === 1 && subset[0].type === 'build' && directBuildMatches.some(db => db.id === subset[0].id))) {
                           validCaptureSets.push(subset);
                        }
                    }
                }
            }
        }

        // --- 3. Remove duplicate sets (based on item IDs) ---
        const uniqueSets = [];
        const seenSetSignatures = new Set();

        validCaptureSets.forEach(set => {
            // Ensure set is valid and items have IDs
            if (Array.isArray(set) && set.every(item => item && item.id)) {
                const signature = set.map(item => item.id).sort().join(',');
                if (!seenSetSignatures.has(signature)) {
                    seenSetSignatures.add(signature);
                    uniqueSets.push(set);
                }
            } else {
                console.error("Capture set generation error: Invalid set or item missing ID in final set:", set);
            }
        });

        // console.log("Generated Valid Captures for", playedCard.suitRank, ":", uniqueSets.map(s => s.map(i => `${i.type}(${i.rank || i.value})-${i.id.slice(-4)}`))); // Debug Log
        return uniqueSets;
    }
}

// Helper function to compare if two arrays of items are the same set (order-independent)
export const areItemSetsEqual = (set1, set2) => {
    if (!set1 || !set2 || !Array.isArray(set1) || !Array.isArray(set2) || set1.length !== set2.length) {
        return false;
    }
    // Ensure items have IDs before comparing
    if (!set1.every(item => item && item.id) || !set2.every(item => item && item.id)) {
        // console.error("Attempted to compare sets with missing IDs"); // Less critical here
        return false; // Cannot compare reliably
    }
    const ids1 = set1.map(item => item.id).sort();
    const ids2 = set2.map(item => item.id).sort();
    return ids1.every((id, index) => id === ids2[index]);
};

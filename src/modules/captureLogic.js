
// src/modules/captureLogic.js
import { combinationValue, canRankCaptureBuildValue, captureCombinationValues } from './deck'; // Import necessary functions/maps

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
        const isPlayedCardNumeric = !['J', 'Q', 'K'].includes(playedRank); // Ace is numeric here for value capture

        // --- 1. Capture by Rank (Cards and Pairs) ---
        // A single card captures ALL cards AND pairs of the same rank simultaneously
        const rankMatchItems = tableItems.filter(item =>
            (item.type === 'card' && item.rank === playedRank) ||
            (item.type === 'pair' && item.rank === playedRank) // Include pairs matching the rank
        );
        if (rankMatchItems.length > 0) {
            validCaptureSets.push([...rankMatchItems]);
        }

        // --- 2. Capture Builds ---
        // A build is captured if the played card's rank can capture the build's value
        const buildMatches = tableItems.filter(item =>
            item.type === 'build' && canRankCaptureBuildValue(playedRank, item.value)
        );
        buildMatches.forEach(build => {
            validCaptureSets.push([build]); // Each matching build is a separate capture option
        });

        // --- 3. Capture Combinations by Value (Using captureCombinationValues: A=14, J=11 etc) ---
        // This is separate from build capture. Only uses numeric cards (A=14) and simple builds (value Ace=1 based).
        // PAIRS CANNOT BE USED IN VALUE COMBINATIONS.
        if (isPlayedCardNumeric) { // Only 2-10, A can capture by value sum
            const playedCaptureValue = captureCombinationValues[playedRank]; // A=14, 2=2...10=10

            // Items eligible for combinations: individual numeric cards (Ace=1) and SIMPLE builds
            const combinableItems = tableItems.filter(item =>
                (item.type === 'card' && !['J', 'Q', 'K'].includes(item.rank)) || // Numeric cards (A=1 for sum)
                (item.type === 'build' && !item.isCompound) // Simple builds only (value is Ace=1 based sum)
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
                    // Check if the sum matches the played card's CAPTURE value (A=14 etc)
                    if (currentSum === playedCaptureValue && subset.length > 0) {
                        validCaptureSets.push(subset);
                    }
                }
            }
        }

        // --- Remove duplicate/subset sets ---
        // Filter out sets that are strict subsets of other valid sets.
        // E.g., if capturing [7C] and [7C, 3D] are both valid, prefer [7C, 3D].
        // However, if [7C] and [Build(7)] are valid, keep both as distinct options.
        const uniqueSets = [];
        const seenSetSignatures = new Set();

        // Sort sets by size descending to process larger sets first
        validCaptureSets.sort((a, b) => b.length - a.length);

        validCaptureSets.forEach(set => {
            if (!set || !set.every(item => item && item.id)) {
                console.error("Capture set contains item(s) without ID or is invalid:", set);
                return; // Skip invalid sets
            }
            const signature = set.map(item => item.id).sort().join(',');
            if (!seenSetSignatures.has(signature)) {
                // Check if this set is a subset of an already added set
                let isSubset = false;
                for (const uniqueSet of uniqueSets) {
                    const uniqueSetIds = new Set(uniqueSet.map(item => item.id));
                    if (set.every(item => uniqueSetIds.has(item.id))) {
                        isSubset = true;
                        break;
                    }
                }

                if (!isSubset) {
                    uniqueSets.push(set);
                    seenSetSignatures.add(signature);
                    // Add signatures of all subsets of this set to prevent smaller versions being added later
                    const setIds = set.map(item => item.id);
                    for (let i = 1; i < (1 << setIds.length); i++) {
                        const subSetSignature = setIds.filter((_, index) => (i >> index) & 1).sort().join(',');
                        seenSetSignatures.add(subSetSignature);
                    }
                }
            }
        });


        // Final filtering: Ensure no sets contain items from different capture types if overlapping?
        // Example: Played 7
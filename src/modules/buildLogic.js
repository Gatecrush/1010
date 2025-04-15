// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// --- Helper Functions ---

/**
 * Gets the numerical value of a card for building (Ace=1, J/Q/K=0).
 */
const getBuildValue = (card) => {
    if (!card || !card.rank) return 0;
    if (card.rank === 'A') return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 0;
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank;
};

/**
 * Gets the numerical value of a table item (card or simple build) for summing.
 */
const getItemValue = (item) => {
  if (!item || !item.type) {
      console.error("getItemValue Error: Item missing type:", item);
      return 0;
  }
  if (item.type === 'card') {
    return getBuildValue(item);
  }
  if (item.type === 'build') {
     return item.isCompound ? 0 : (typeof item.value === 'number' ? item.value : 0);
  }
  return 0;
};

/**
 * Checks if a card is a face card (J, Q, K).
 */
const isFaceCard = (card) => {
    if (!card || !card.rank) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
};

/**
 * Gets the rank string ('A', '2'-'10') corresponding to a build value (1-10).
 */
const getRankFromValue = (value) => {
    if (value < 1 || value > 10) return null;
    if (value === 1) return 'A';
    return String(value);
};

// --- Partitioning Helper Function (for Combination Builds) ---

/**
 * Checks if a list of card values can be partitioned into k groups each summing to targetValue.
 * Uses backtracking.
 * @param {number[]} values - Array of card values.
 * @param {number} k - Number of groups required.
 * @param {number} targetValue - The target sum for each group.
 * @returns {boolean} True if partition is possible.
 */
const canPartitionIntoKSubsets = (values, k, targetValue) => {
    if (k === 0) return true; // Base case: no more groups needed
    if (values.length === 0) return false; // Base case: no more values but groups needed

    const n = values.length;
    const used = Array(n).fill(false);
    values.sort((a, b) => b - a); // Optimization: Sort descending

    function backtrack(startIndex, currentSum, groupsRemaining) {
        if (groupsRemaining === 0) return true; // All groups formed successfully

        // If current group sum reaches target, start forming the next group
        if (currentSum === targetValue) {
            return backtrack(0, 0, groupsRemaining - 1);
        }
        // If sum exceeds target, this path is invalid
        if (currentSum > targetValue) {
            return false;
        }

        for (let i = startIndex; i < n; i++) {
            if (!used[i]) {
                // Optimization: If adding this value exceeds target, skip
                if (currentSum + values[i] > targetValue) continue;

                used[i] = true;
                if (backtrack(i + 1, currentSum + values[i], groupsRemaining)) {
                    return true; // Found a valid partition
                }
                used[i] = false; // Backtrack

                // Optimization: Skip duplicate values to avoid redundant checks
                while (i + 1 < n && values[i] === values[i + 1]) {
                    i++;
                }
                 // Optimization: If adding the first element (values[0]) didn't work for a new group,
                 // no other element will work either because they are smaller or equal.
                 if (currentSum === 0) break;
            }
        }
        return false; // No valid partition found from this state
    }

    // Start the backtracking process
    return backtrack(0, 0, k);
};


// --- Validation Helper Functions ---

/**
 * Performs initial validation checks common to all build types.
 */
const checkInitialConditions = (playedCard, selectedItems) => {
    if (!playedCard || !selectedItems || selectedItems.length === 0) {
        return { isValid: false, message: "Select a card from hand and items from table." };
    }
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Validation Error: Some selected items are invalid or missing IDs.");
        return { isValid: false, message: "Internal error: Invalid items selected." };
    }
    if (isFaceCard(playedCard)) {
        return { isValid: false, message: "Cannot use a face card to declare a build." };
    }
    if (selectedItems.some(item =>
        (item.type === 'card' && isFaceCard(item)) ||
        item.type === 'pair' ||
        (item.type === 'build' && item.isCompound)
    )) {
        return { isValid: false, message: "Cannot select face cards, pairs, or compound builds for building." };
    }
    return { isValid: true };
};

/**
 * Checks if the player holds another card of the target rank (excluding the played card).
 */
const checkForHoldingCard = (targetCaptureRank, playedCard, playerHand) => {
    if (!targetCaptureRank) return false;
    return playerHand.some(handCard =>
        handCard && handCard.suitRank !== playedCard.suitRank &&
        handCard.rank === targetCaptureRank
    );
};

/**
 * Checks if the player already controls a build intended for the same target capture rank.
 */
const checkForExistingBuildOfRank = (targetCaptureRank, currentPlayer, tableItems, buildBeingModified) => {
    if (!targetCaptureRank) return false;
    return tableItems.some(item =>
        item && item.id &&
        item.type === 'build' &&
        item.controller === currentPlayer &&
        item.targetRank === targetCaptureRank &&
        (!buildBeingModified || item.id !== buildBeingModified.id)
    );
};

// --- Main Validation Function ---

/**
 * Validates if a build action is possible.
 */
export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
    // --- 1. Initial Checks ---
    const initialCheck = checkInitialConditions(playedCard, selectedItems);
    if (!initialCheck.isValid) {
        return initialCheck;
    }

    // --- 2. Identify Potential Existing Build ---
    const selectedBuilds = selectedItems.filter(item => item.type === 'build');
    let buildBeingModified = null;
    let otherSelectedItems = []; // Cards selected from table

    if (selectedBuilds.length > 1) {
        return { isValid: false, message: "Cannot select more than one existing build." };
    } else if (selectedBuilds.length === 1) {
        buildBeingModified = selectedBuilds[0];
        if (buildBeingModified.controller !== currentPlayer) {
            return { isValid: false, message: "Cannot modify a build you don't control." };
        }
        otherSelectedItems = selectedItems.filter(item => item.id !== buildBeingModified.id);
    } else {
        otherSelectedItems = selectedItems; // All selected items are cards
    }

    // Ensure otherSelectedItems are only cards
    if (otherSelectedItems.some(item => item.type !== 'card')) {
        console.error("Validation Error: 'otherSelectedItems' contain non-card items.", otherSelectedItems);
        return { isValid: false, message: "Invalid item selected for building (must be cards)." };
    }

    const isModification = !!buildBeingModified;

    // --- 3. Validation Logic ---

    if (isModification) {
        // --- 3a. Modifying an Existing Build ---
        const targetCaptureRank = buildBeingModified.targetRank;

        if (playedCard.rank !== targetCaptureRank) {
            return { isValid: false, message: `Played card (${playedCard.rank}) must match the build's target rank (${targetCaptureRank}) to modify it.` };
        }

        const playedCardValue = getBuildValue(playedCard);
        const selectedCardsValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
        const finalBuildValue = (buildBeingModified.value || 0) + playedCardValue + selectedCardsValue;

        const rankForFinalValue = getRankFromValue(finalBuildValue);
        if (rankForFinalValue !== targetCaptureRank) {
             return { isValid: false, message: `Resulting build value (${finalBuildValue}) does not match the build's target rank (${targetCaptureRank}).` };
        }

        if (!checkForHoldingCard(targetCaptureRank, playedCard, playerHand)) {
            return { isValid: false, message: `You need another ${targetCaptureRank} in hand to capture this build.` };
        }
        // Duplicate check not needed when modifying the *only* build of that rank

        return {
            isValid: true,
            buildValue: finalBuildValue,
            targetRank: targetCaptureRank,
            isModification: true,
            targetBuild: buildBeingModified,
            summingItems: otherSelectedItems,
            message: `Adding to build ${targetCaptureRank}. New value: ${finalBuildValue}.`
        };

    } else {
        // --- 3b. Creating a New Build ---
        const targetCaptureRank = playedCard.rank; // Target rank is declared by the played card
        const targetValue = getBuildValue(playedCard); // The value each group must sum to

        // Rule: Must hold another card matching the target capture rank
        if (!checkForHoldingCard(targetCaptureRank, playedCard, playerHand)) {
            return { isValid: false, message: `You need another ${targetCaptureRank} in hand to capture this build.` };
        }

        // Rule: Cannot have multiple builds for the same capture rank
        if (checkForExistingBuildOfRank(targetCaptureRank, currentPlayer, tableItems, null)) {
            return { isValid: false, message: `You already control a build for rank ${targetCaptureRank}.` };
        }

        // Combine played card and selected cards for partitioning check
        const allCardsForBuild = [playedCard, ...otherSelectedItems];
        const allValues = allCardsForBuild.map(getBuildValue);
        const totalSum = allValues.reduce((a, b) => a + b, 0);

        // Check if the total sum is divisible by the target value
        if (totalSum === 0 || totalSum % targetValue !== 0) {
             return { isValid: false, message: `Combination value (${totalSum}) is not divisible by target value (${targetValue} for rank ${targetCaptureRank}).` };
        }

        const k = totalSum / targetValue; // Number of groups needed

        // Check if the combined cards can be partitioned
        if (!canPartitionIntoKSubsets(allValues, k, targetValue)) {
            return { isValid: false, message: `Selected cards cannot be combined with played card to form groups of ${targetValue}.` };
        }

        // If partition is possible, the build is valid
        return {
            isValid: true,
            buildValue: targetValue, // The value of the build is the target value per group
            targetRank: targetCaptureRank, // The rank needed to capture
            isModification: false,
            targetBuild: null,
            summingItems: otherSelectedItems, // Table cards used
            message: `Creating combination build ${targetCaptureRank}.`
        };
    }
};

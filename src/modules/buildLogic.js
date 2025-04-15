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
    // Allow selecting existing builds ONLY when modifying
    const selectedBuilds = selectedItems.filter(item => item.type === 'build');
    if (selectedBuilds.length > 0 && selectedItems.length !== selectedBuilds.length) {
         // Cannot mix selecting builds and cards unless modifying that specific build
         if (selectedBuilds.length !== 1 || selectedItems.length === 1) {
              return { isValid: false, message: "Cannot select cards and builds together unless modifying." };
         }
    }
    // Check selected items themselves (excluding builds for now)
    if (selectedItems.some(item => item.type !== 'build' && (
        (item.type === 'card' && isFaceCard(item)) ||
        item.type === 'pair' ||
        (item.type === 'build' && item.isCompound) // Should be caught above, but double check
    ))) {
        return { isValid: false, message: "Cannot select face cards or pairs for building." };
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
        // This indicates modification attempt
        buildBeingModified = selectedBuilds[0];
        if (buildBeingModified.controller !== currentPlayer) {
            return { isValid: false, message: "Cannot modify a build you don't control." };
        }
        // When modifying, otherSelectedItems are the *cards* selected alongside the build
        otherSelectedItems = selectedItems.filter(item => item.id !== buildBeingModified.id);
        // Ensure only cards are selected alongside the build being modified
        if (otherSelectedItems.some(item => item.type !== 'card')) {
             return { isValid: false, message: "Can only select cards when adding to an existing build." };
        }
    } else {
        // No build selected, attempt to create a new build. All selected items must be cards.
        if (selectedItems.some(item => item.type !== 'card')) {
             return { isValid: false, message: "Must select only cards to create a new build." };
        }
        otherSelectedItems = selectedItems;
    }

    const isModification = !!buildBeingModified;

    // --- 3. Validation Logic ---

    if (isModification) {
        // --- 3a. Modifying an Existing Build ---
        const targetCaptureRank = buildBeingModified.targetRank;

        // Rule: Played card's rank must match the build's target rank to add to it
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
        const playedCardValue = getBuildValue(playedCard);
        const selectedCardsValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);

        // Try Scenario A: Value Match Build
        // Selected cards sum to played card's value?
        if (selectedCardsValue === playedCardValue) {
            const targetCaptureRank = playedCard.rank; // Target rank is played card's rank
            const finalBuildValue = selectedCardsValue; // Value is sum of selected cards

            if (!checkForHoldingCard(targetCaptureRank, playedCard, playerHand)) {
                return { isValid: false, message: `You need another ${targetCaptureRank} in hand to capture this build.` };
            }
            if (checkForExistingBuildOfRank(targetCaptureRank, currentPlayer, tableItems, null)) {
                return { isValid: false, message: `You already control a build for rank ${targetCaptureRank}.` };
            }

            return {
                isValid: true,
                buildValue: finalBuildValue,
                targetRank: targetCaptureRank,
                isModification: false,
                targetBuild: null,
                summingItems: otherSelectedItems,
                message: `Creating build ${targetCaptureRank} (value matches played card).`
            };
        }

        // Try Scenario B: Summation Build
        // Played card + selected cards sum determines target rank
        const finalBuildValue = playedCardValue + selectedCardsValue;
        const targetCaptureRank = getRankFromValue(finalBuildValue);

        if (targetCaptureRank) { // Check if the sum corresponds to a valid rank (A-10)
            if (!checkForHoldingCard(targetCaptureRank, playedCard, playerHand)) {
                return { isValid: false, message: `You need a ${targetCaptureRank} in hand to capture this build.` };
            }
            if (checkForExistingBuildOfRank(targetCaptureRank, currentPlayer, tableItems, null)) {
                return { isValid: false, message: `You already control a build for rank ${targetCaptureRank}.` };
            }

            return {
                isValid: true,
                buildValue: finalBuildValue,
                targetRank: targetCaptureRank,
                isModification: false,
                targetBuild: null,
                summingItems: otherSelectedItems,
                message: `Creating build ${targetCaptureRank} (value from sum).`
            };
        }

        // If neither Scenario A nor B worked
        return { isValid: false, message: "Invalid combination for a new build." };
    }
};

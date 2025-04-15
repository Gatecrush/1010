// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// --- Helper Functions ---

/**
 * Gets the numerical value of a card for building (Ace=1, J/Q/K=0).
 * @param {object} card - The card object.
 * @returns {number} The build value.
 */
const getBuildValue = (card) => {
    if (!card || !card.rank) return 0;
    if (card.rank === 'A') return 1;
    // J, Q, K have no build value
    if (["J", "Q", "K"].includes(card.rank)) return 0;
    const numRank = parseInt(card.rank);
    // Ensure ranks like '10' are parsed correctly
    return isNaN(numRank) ? 0 : numRank;
};

/**
 * Gets the numerical value of a table item (card or simple build) for summing.
 * @param {object} item - The table item object.
 * @returns {number} The item's value for building.
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
     // Only simple builds contribute value when being built upon
     // Ensure value exists before returning
     return item.isCompound ? 0 : (typeof item.value === 'number' ? item.value : 0);
  }
  // Pairs or other types have no value in builds
  return 0;
};

/**
 * Checks if a card is a face card (J, Q, K).
 * @param {object} card - The card object.
 * @returns {boolean} True if the card is a face card.
 */
const isFaceCard = (card) => {
    if (!card || !card.rank) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
};

/**
 * Gets the rank string ('A', '2'-'10') corresponding to a build value (1-10).
 * Returns null if the value is invalid for a build rank.
 * @param {number} value - The numerical value (1-10).
 * @returns {string|null} The rank string or null.
 */
const getRankFromValue = (value) => {
    if (value < 1 || value > 10) return null; // Builds can only represent ranks A through 10
    if (value === 1) return 'A';
    // Ranks 2 through 9 are straightforward
    // Rank 10 corresponds to value 10
    return String(value);
};


// --- Validation Helper Functions ---

/**
 * Performs initial validation checks common to all build types.
 * @param {object} playedCard - The card played from hand.
 * @param {array} selectedItems - Items selected from the table.
 * @returns {object} { isValid: boolean, message?: string }
 */
const checkInitialConditions = (playedCard, selectedItems) => {
    if (!playedCard || !selectedItems || selectedItems.length === 0) {
        return { isValid: false, message: "Select a card from hand and items from table." };
    }
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Validation Error: Some selected items are invalid or missing IDs.");
        return { isValid: false, message: "Internal error: Invalid items selected." };
    }
    // Rule: Played card cannot be a face card for building
    if (isFaceCard(playedCard)) {
        return { isValid: false, message: "Cannot use a face card to declare a build." };
    }
    // Rule: Selected items cannot contain face cards, pairs, or compound builds
    if (selectedItems.some(item =>
        (item.type === 'card' && isFaceCard(item)) ||
        item.type === 'pair' ||
        (item.type === 'build' && item.isCompound) // Cannot select compound builds
    )) {
        return { isValid: false, message: "Cannot select face cards, pairs, or compound builds for building." };
    }
    return { isValid: true };
};

/**
 * Checks if the player holds another card of the target rank (excluding the played card).
 * @param {string} targetCaptureRank - The rank required to capture the build.
 * @param {object} playedCard - The card played from hand (used to exclude itself).
 * @param {array} playerHand - The player's current hand.
 * @returns {boolean} True if a holding card exists.
 */
const checkForHoldingCard = (targetCaptureRank, playedCard, playerHand) => {
    // Ensure targetCaptureRank is valid before checking
    if (!targetCaptureRank) return false;
    return playerHand.some(handCard =>
        handCard && handCard.suitRank !== playedCard.suitRank &&
        handCard.rank === targetCaptureRank
    );
};

/**
 * Checks if the player already controls a build intended for the same target capture rank.
 * @param {string} targetCaptureRank - The rank the build is intended to be captured by.
 * @param {number} currentPlayer - The current player (1 or 2).
 * @param {array} tableItems - All items currently on the table.
 * @param {object|null} buildBeingModified - The specific build being modified (to exclude it from the check).
 * @returns {boolean} True if a duplicate build exists.
 */
const checkForExistingBuildOfRank = (targetCaptureRank, currentPlayer, tableItems, buildBeingModified) => {
     // Ensure targetCaptureRank is valid before checking
    if (!targetCaptureRank) return false;
    return tableItems.some(item =>
        item && item.id &&
        item.type === 'build' &&
        item.controller === currentPlayer &&
        item.targetRank === targetCaptureRank && // Check against the build's intended target capture rank
        (!buildBeingModified || item.id !== buildBeingModified.id) // Exclude the build being modified
    );
};

// --- Main Validation Function ---

/**
 * Validates if a build action is possible, distinguishing between single and multi-builds.
 * @param {object} playedCard - The card played from hand.
 * @param {array} selectedItems - Items selected from the table (can include one existing build).
 * @param {array} playerHand - The player's current hand.
 * @param {array} tableItems - All items currently on the table.
 * @param {number} currentPlayer - The current player (1 or 2).
 * @returns {object} Validation result: { isValid: boolean, message?: string, buildValue?: number, isModification?: boolean, targetBuild?: object|null, summingItems?: array, targetRank?: string }
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
        // Rule: Can only modify builds you control
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

    // --- 3. Calculate Build Value and Determine Target Capture Rank ---
    const playedCardValue = getBuildValue(playedCard);
    const selectedCardsValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
    const existingBuildValue = buildBeingModified ? (buildBeingModified.value || 0) : 0;

    // The final value of the build after this move
    const finalBuildValue = playedCardValue + selectedCardsValue + existingBuildValue;

    // Determine the rank needed to capture this build
    const targetCaptureRank = isModification
        ? buildBeingModified.targetRank // If modifying, the target rank doesn't change
        : getRankFromValue(finalBuildValue); // If new build, target rank is based on final value

    // Rule: Final build value must correspond to a valid rank (A-10)
    if (!targetCaptureRank) {
         return { isValid: false, message: `Resulting build value (${finalBuildValue}) is invalid (must be 1-10).` };
    }

    // --- 4. Common Checks (Holding Card & Duplicate Build) ---
    // Rule: Must hold a card matching the target *capture* rank
    if (!checkForHoldingCard(targetCaptureRank, playedCard, playerHand)) {
        return { isValid: false, message: `You need a ${targetCaptureRank} in hand to capture this build.` };
    }
    // Rule: Cannot have multiple builds for the same *capture* rank
    if (checkForExistingBuildOfRank(targetCaptureRank, currentPlayer, tableItems, buildBeingModified)) {
        return { isValid: false, message: `You already control a build for rank ${targetCaptureRank}.` };
    }

    // --- 5. Return Validation Success ---
    return {
        isValid: true,
        buildValue: finalBuildValue, // The final value of the build
        targetRank: targetCaptureRank, // The rank needed to capture this build
        isModification: isModification,
        targetBuild: buildBeingModified, // The build being modified (null if new)
        summingItems: otherSelectedItems, // The cards selected from the table
        message: isModification ? `Adding to build ${targetCaptureRank}. New value: ${finalBuildValue}.` : `Creating build ${targetCaptureRank} with value ${finalBuildValue}.`
    };
};

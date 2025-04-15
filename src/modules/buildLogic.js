// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card) return 0;
    if (card.rank === 'A') return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 0; // Face cards have no build value
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank;
};


// Helper to get the value of a table item for building/matching (card or simple build)
const getItemValue = (item) => {
  if (!item) return 0;
  // Ensure item has necessary properties before accessing them
  if (!item.type) {
      console.error("Item missing type:", item);
      return 0;
  }
  if (item.type === 'card') {
    if (!item.rank) { console.error("Card item missing rank:", item); return 0; }
    return getBuildValue(item); // Use Ace=1, JQK=0
  }
  if (item.type === 'build') {
     if (item.isCompound) return 0; // Compound builds have no value here
     if (typeof item.value !== 'number') { console.error("Build item missing value:", item); return 0; }
     return item.value;
  }
  // Pairs or other types have no value here
  return 0;
};

// Helper to check if a card is a face card
const isFaceCard = (card) => {
    if (!card || !card.rank) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
}

// Helper to get the rank string from a build value (1-10)
const getRankFromValue = (value) => {
    if (value < 1 || value > 10) return null; // Invalid build value
    if (value === 1) return 'A';
    return String(value); // '2' through '10'
}

/**
 * Validates if a build action is possible.
 */
export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
    // --- Initial Checks ---
    if (!playedCard || !selectedItems || selectedItems.length === 0) {
        return { isValid: false, message: "Select a card from hand and items from table." };
    }
    // Ensure all selected items are valid objects with IDs
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Validation Error: Some selected items are invalid or missing IDs.");
        return { isValid: false, message: "Internal error: Invalid items selected." };
    }
    // Rule: Played card cannot be a face card for building
    if (isFaceCard(playedCard)) {
        return { isValid: false, message: "Cannot use a face card to declare a build." };
    }
    // Rule: Selected items cannot contain face cards, pairs, or compound builds
    if (selectedItems.some(item => (item.type === 'card' && isFaceCard(item)) || item.type === 'pair' || (item.type === 'build' && item.isCompound))) {
        return { isValid: false, message: "Cannot select face cards, pairs, or compound builds for building." };
    }

    // --- Determine Target Rank from Played Card ---
    const targetBuildRank = playedCard.rank; // Rank declared by the played card (A, 2-10)
    // const targetBuildValue = getBuildValue(playedCard); // Numerical value (1-10) - NO LONGER USED DIRECTLY
    // if (targetBuildValue === 0) {
    //     return { isValid: false, message: "Played card has no valid build value." };
    // }

    // --- Separate Target Build (if modifying) and Other Items ---
    let targetBuild = null; // The existing build being modified (if any)
    let otherSelectedItems = []; // Items selected from table (must be cards or simple builds)

    const selectedBuilds = selectedItems.filter(item => item.type === 'build');

    if (selectedBuilds.length > 1) {
        return { isValid: false, message: "Cannot select more than one existing build." };
    } else if (selectedBuilds.length === 1) {
        targetBuild = selectedBuilds[0];
        // Ensure targetBuild is valid before proceeding
        if (!targetBuild || !targetBuild.id || targetBuild.isCompound) { // Cannot modify compound builds
            console.error("Validation Error: Invalid target build object or is compound.");
            return { isValid: false, message: "Cannot modify a compound build." };
        }
        otherSelectedItems = selectedItems.filter(item => item.id !== targetBuild.id);
    } else {
        otherSelectedItems = selectedItems;
    }

    // Ensure otherSelectedItems are valid types (cards or simple builds) and have IDs
    if (otherSelectedItems.some(item => !item || !item.id || (item.type !== 'card' && !(item.type === 'build' && !item.isCompound)))) {
        console.error("Validation Error: Invalid 'otherSelectedItems'.", otherSelectedItems);
        return { isValid: false, message: "Invalid item selected for building (must be cards or simple builds)." };
    }

    const isModification = !!targetBuild;
    const n = otherSelectedItems.length; // Number of table items selected

    // --- New Logic: Build to be captured later ---
    let totalBuildValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);

    // 1. Check for Holding Card (Check RANK)
    // Must hold another card matching the RANK declared by the played card.
    const hasHoldingCard = playerHand.some(handCard =>
        handCard && handCard.suitRank !== playedCard.suitRank &&
        handCard.rank === targetBuildRank
    );
    if (!hasHoldingCard) {
        return { isValid: false, message: `You need another ${targetBuildRank} in hand to capture this build later.` };
    }

    // 2. Duplicate Build Check (Rank-Based)
     const existingPlayerBuildOfRank = tableItems.find(item =>
        item && item.id &&
        item.type === 'build' &&
        item.cards.some(card => card.rank === targetBuildRank) && // Check if ANY card in the build has the target rank
        item.controller === currentPlayer &&
        (!targetBuild || item.id !== targetBuild.id) // Exclude the build being modified
    );
    if (existingPlayerBuildOfRank) {
        return { isValid: false, message: `You already control a build that can be captured with a ${targetBuildRank}.` };
    }

    // --- If all checks passed ---
    return {
        isValid: true,
        buildValue: totalBuildValue, // The value of the resulting build
        isModification: isModification,
        targetBuild: targetBuild,
        summingItems: otherSelectedItems, // All selected items are summing items
        cascadingItems: [], // No cascading items in this logic
        message: `Building towards ${targetBuildRank} with value ${totalBuildValue}.`
    };
};

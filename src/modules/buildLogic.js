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

/**
 * Validates if a build action is possible, handling complex selections
 * by iterating through potential summing groups and validating remaining items match.
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
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  if (selectedItems.some(item => item.type === 'pair' || (item.type === 'build' && item.isCompound))) {
      return { isValid: false, message: "Cannot select pairs or compound builds for building." };
  }
  const playedCardValue = getBuildValue(playedCard);
  if (playedCardValue === 0) {
      return { isValid: false, message: "Played card has no build value." };
  }

  // --- Separate Target Build and Other Items ---
  let targetBuild = null;
  let otherSelectedItems = []; // Must be cards or simple builds

  const selectedBuilds = selectedItems.filter(item => item.type === 'build');

  if (selectedBuilds.length > 1) {
      return { isValid: false, message: "Cannot select more than one existing build." };
  } else if (selectedBuilds.length === 1) {
      targetBuild = selectedBuilds[0];
      // Ensure targetBuild is valid before proceeding
      if (!targetBuild || !targetBuild.id) {
           console.error("Validation Error: Invalid target build object.");
           return { isValid: false, message: "Internal error: Invalid target build." };
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
  const n = otherSelectedItems.length;

  // --- Iterate through Subsets of otherSelectedItems as potential summingGroups ---
  // We iterate from 0 to 2^n - 1. i=0 represents the case where *only* the played card contributes value.
  for (let i = 0; i < (1 << n); i++) {
      const currentSummingGroup = [];
      const currentRemainingIds = new Set(otherSelectedItems.map(item => item.id));
      let summingGroupValue = 0;

      // Build the currentSummingGroup based on the bits in i
      for (let j = 0; j < n; j++) {
          if ((i >> j) & 1) { // If the j-th item is in this subset
              const item = otherSelectedItems[j];
              // Basic check again inside loop for safety
              if (!item || !item.id) { console.error("Loop Error: Invalid item in otherSelectedItems"); continue; }
              currentSummingGroup.push(item);
              summingGroupValue += getItemValue(item);
              currentRemainingIds.delete(item.id);
          }
      }

      // Calculate the target value for this specific combination
      const currentBuildValue = playedCardValue + summingGroupValue + (targetBuild ? getItemValue(targetBuild) : 0);
      if (currentBuildValue <= 0) continue; // Builds must have a positive value

      // Get the actual remaining items (potential matching group)
      const currentRemainingItems = otherSelectedItems.filter(item => currentRemainingIds.has(item.id));

      // --- Perform Checks for this Combination ---

      // Check 1: Validate Matching Group
      // Every item in the remaining group must have a value equal to the target build value
      if (currentRemainingItems.some(item => getItemValue(item) !== currentBuildValue)) {
          // console.log(`Subset ${i} failed: Remaining items don't match ${currentBuildValue}`);
          continue; // Try next subset
      }

      // Check 2: Holding Card
      const hasHoldingCard = playerHand.some(handCard =>
          handCard && handCard.suitRank !== playedCard.suitRank && // Ensure handCard is valid and not the played card
          getBuildValue(handCard) === currentBuildValue
      );
      if (!hasHoldingCard) {
          // console.log(`Subset ${i} failed: Need holding card ${currentBuildValue}`);
          continue; // Try next subset
      }

      // Check 3: Duplicate Build Check
      const existingPlayerBuildOfValue = tableItems.find(item =>
          item && item.id && // Ensure item on table is valid
          item.type === 'build' &&
          item.value === currentBuildValue &&
          item.controller === currentPlayer &&
          (!targetBuild || item.id !== targetBuild.id) // Exclude the build being modified
      );
      if (existingPlayerBuildOfValue) {
          // console.log(`Subset ${i} failed: Duplicate build ${currentBuildValue}`);
          continue; // Try next subset
      }

      // --- If all checks passed for this subset ---
      // console.log(`Subset ${i} success: BuildValue=${currentBuildValue}, Summing=${currentSummingGroup.map(x=>x.id)}, Cascading=${currentRemainingItems.map(x=>x.id)}`);
      return {
          isValid: true,
          buildValue: currentBuildValue, // The actual value of the resulting build
          isModification: isModification,
          targetBuild: targetBuild,
          summingItems: currentSummingGroup, // The successful summing group
          cascadingItems: currentRemainingItems, // The items that matched
          message: `Build ${currentBuildValue} is valid.`
      };

  } // End of subset loop

  // --- If no valid subset combination was found ---
  // Calculate a potential target value based on *all* selected items for the error message
  const fullSumValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
  const potentialFullTarget = playedCardValue + fullSumValue + (targetBuild ? getItemValue(targetBuild) : 0);

  // Check if the holding card was the likely issue
   const needsHoldingCardCheck = playerHand.some(handCard =>
          handCard && handCard.suitRank !== playedCard.suitRank &&
          getBuildValue(handCard) === potentialFullTarget
      );

  if (potentialFullTarget > 0 && !needsHoldingCardCheck) {
       return { isValid: false, message: `Invalid combination. You might need a ${potentialFullTarget} in hand.` };
  } else {
       return { isValid: false, message: "Invalid build combination selected." };
  }
};

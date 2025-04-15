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
 * The played card declares the target rank/value.
 * Selected table items must sum to that value.
 * Player must hold another card of the target rank.
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

  // --- Determine Target Value from Played Card ---
  const targetBuildRank = playedCard.rank; // Rank declared by the played card (A, 2-10)
  const targetBuildValue = getBuildValue(playedCard); // Numerical value (1-10)
  if (targetBuildValue === 0) {
      // This should be caught by the isFaceCard check above, but double-check
      return { isValid: false, message: "Played card has no valid build value." };
  }

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
  const n = otherSelectedItems.length; // Number of table items selected (excluding the one being modified)

  // --- Iterate through Subsets of otherSelectedItems as potential summingGroups ---
  // The goal is to find a subset (`summingGroup`) whose value, when added to the
  // value of the `targetBuild` (if any), equals the `targetBuildValue` declared by the played card.
  // The remaining selected items (`cascadingItems`) must *also* match the `targetBuildValue`.

  // We iterate from 0 to 2^n - 1. i=0 represents the case where *no* table items contribute to the sum
  // (only the targetBuild, if modifying, needs to match the targetBuildValue).
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

      // Calculate the total value of the items intended to form the build's core value
      const coreBuildSum = summingGroupValue + (targetBuild ? getItemValue(targetBuild) : 0);

      // --- Perform Checks for this Combination ---

      // Check 1: Core Sum Match
      // The sum of the summing group + the build being modified (if any) MUST equal the target value declared by the played card.
      if (coreBuildSum !== targetBuildValue) {
          // console.log(`Subset ${i} failed: Core sum ${coreBuildSum} != target ${targetBuildValue}`);
          continue; // Try next subset
      }

      // Get the actual remaining items (potential matching/cascading group)
      const currentRemainingItems = otherSelectedItems.filter(item => currentRemainingIds.has(item.id));

      // Check 2: Validate Matching/Cascading Group
      // Every item in the remaining group must have a value equal to the target build value.
      if (currentRemainingItems.some(item => getItemValue(item) !== targetBuildValue)) {
          // console.log(`Subset ${i} failed: Remaining items don't match ${targetBuildValue}`);
          continue; // Try next subset
      }

      // Check 3: Holding Card (Check RANK)
      // Must hold another card matching the RANK declared by the played card.
      const hasHoldingCard = playerHand.some(handCard =>
          handCard && handCard.suitRank !== playedCard.suitRank && // Ensure handCard is valid and not the played card
          handCard.rank === targetBuildRank // Check if the RANK matches
      );
      if (!hasHoldingCard) {
          // console.log(`Subset ${i} failed: Need holding card rank ${targetBuildRank}`);
          continue; // Try next subset
      }

      // Check 4: Duplicate Build Check
      // Cannot create a build of a value if the player already controls one (unless modifying that specific build).
      const existingPlayerBuildOfValue = tableItems.find(item =>
          item && item.id && // Ensure item on table is valid
          item.type === 'build' &&
          item.value === targetBuildValue &&
          item.controller === currentPlayer &&
          (!targetBuild || item.id !== targetBuild.id) // Exclude the build being modified
      );
      if (existingPlayerBuildOfValue) {
          // console.log(`Subset ${i} failed: Duplicate build ${targetBuildValue}`);
          continue; // Try next subset
      }

      // --- If all checks passed for this subset ---
      // console.log(`Subset ${i} success: BuildValue=${targetBuildValue}, Summing=${currentSummingGroup.map(x=>x.id)}, Cascading=${currentRemainingItems.map(x=>x.id)}`);
      return {
          isValid: true,
          buildValue: targetBuildValue, // The value of the resulting build (declared by played card)
          isModification: isModification,
          targetBuild: targetBuild,
          summingItems: currentSummingGroup, // The successful summing group
          cascadingItems: currentRemainingItems, // The items that matched
          message: `Build ${targetBuildRank} is valid.` // Use rank in message
      };

  } // End of subset loop

  // --- If no valid subset combination was found ---
  // Provide a more helpful error message
  const potentialCoreSum = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0) + (targetBuild ? getItemValue(targetBuild) : 0);

  if (potentialCoreSum !== targetBuildValue) {
      return { isValid: false, message: `Selected table items sum to ${potentialCoreSum}, but build requires a sum of ${targetBuildValue} (for rank ${targetBuildRank}).` };
  }

  // If sum was correct, check holding card again for the error message
  const needsHoldingCard = !playerHand.some(handCard =>
      handCard && handCard.suitRank !== playedCard.suitRank &&
      handCard.rank === targetBuildRank
  );
  if (needsHoldingCard) {
      return { isValid: false, message: `Invalid combination. You need another ${targetBuildRank} in hand.` };
  }

  // Default error if other checks failed (like cascading items mismatch or duplicate build)
  return { isValid: false, message: "Invalid build combination selected." };
};

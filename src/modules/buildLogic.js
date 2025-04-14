// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// --- Helper Functions (getBuildValue, getItemValue, isFaceCard - remain the same) ---
const getBuildValue = (card) => {
    if (!card) return 0;
    if (card.rank === 'A') return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 0;
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank;
};

const getItemValue = (item) => {
  if (!item) return 0;
  if (!item.type) { console.error("Item missing type:", item); return 0; }
  if (item.type === 'card') {
    if (!item.rank) { console.error("Card item missing rank:", item); return 0; }
    return getBuildValue(item);
  }
  if (item.type === 'build') {
     if (item.isCompound) return 0;
     if (typeof item.value !== 'number') { console.error("Build item missing value:", item); return 0; }
     return item.value;
  }
  return 0;
};

const isFaceCard = (card) => {
    if (!card || !card.rank) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
};
// --- End Helper Functions ---


/**
 * Helper function to check if a list of items can be partitioned into groups
 * where each group sums exactly to the targetSum.
 * @param {array} items - Array of items (cards or simple builds) with IDs and values.
 * @param {number} targetSum - The required sum for each partition group.
 * @returns {boolean} - True if a valid partition exists, false otherwise.
 */
const canPartition = (items, targetSum) => {
    // Base case: If no items left, we successfully partitioned everything.
    if (!items || items.length === 0) {
        return true;
    }
    // Ensure targetSum is positive
    if (targetSum <= 0) return false;

    const n = items.length;
    const itemIds = items.map(item => item.id); // Work with IDs for uniqueness

    // Try every non-empty subset as the potential "first group"
    for (let i = 1; i < (1 << n); i++) {
        let currentGroupSum = 0;
        let currentGroupIds = new Set();
        let remainingItemIds = new Set(itemIds); // Start with all IDs for remaining

        for (let j = 0; j < n; j++) {
            if ((i >> j) & 1) { // If the j-th item is in this subset
                const item = items[j];
                currentGroupSum += getItemValue(item);
                currentGroupIds.add(item.id);
                remainingItemIds.delete(item.id); // Remove from remaining
            }
        }

        // Check if the current group sums correctly
        if (currentGroupSum === targetSum) {
            // If it sums correctly, recursively check if the *remaining* items
            // can also be partitioned into groups summing to targetSum.
            const remainingItems = items.filter(item => remainingItemIds.has(item.id));
            if (canPartition(remainingItems, targetSum)) {
                // If the recursive call is successful, we found a valid partition.
                return true;
            }
            // If recursive call failed, this subset didn't work, continue trying others.
        }
    }

    // If no subset worked as the first group for a valid partition.
    return false;
};


/**
 * Validates build actions, including multi-set initiation.
 */
export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
  // --- Initial Checks ---
  if (!playedCard || !selectedItems || selectedItems.length === 0) {
    return { isValid: false, message: "Select a card from hand and items from table." };
  }
  if (!selectedItems.every(item => item && item.id)) {
      return { isValid: false, message: "Internal error: Invalid items selected." };
  }
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  if (selectedItems.some(item => item.type === 'pair' || (item.type === 'build' && item.isCompound))) {
      return { isValid: false, message: "Cannot select pairs or compound builds for building." };
  }
  const playedCardValue = getBuildValue(playedCard);
   // Allow playedCardValue of 0 only if it's a face card (rules might allow this later?)
   // For now, standard builds require a numeric card contribution or match.
  if (playedCardValue === 0 && !isFaceCard(playedCard)) {
       return { isValid: false, message: "Played card has no build value." };
  }

  // --- Determine Case: Initiation vs Modification ---
  let targetBuild = null;
  const selectedBuilds = selectedItems.filter(item => item.type === 'build');

  if (selectedBuilds.length > 1) {
      return { isValid: false, message: "Cannot select more than one existing build." };
  } else if (selectedBuilds.length === 1) {
      targetBuild = selectedBuilds[0];
      if (!targetBuild || !targetBuild.id) {
           return { isValid: false, message: "Internal error: Invalid target build." };
      }
  }
  const isModification = !!targetBuild;

  // --- Validate Based on Case ---

  if (isModification) {
      // --- MODIFICATION Case ---
      // Use the complex subset logic for summing/matching relative to targetBuild
      const otherSelectedItems = selectedItems.filter(item => item.id !== targetBuild.id);
      if (otherSelectedItems.some(item => !item || !item.id || (item.type !== 'card' && !(item.type === 'build' && !item.isCompound)))) {
           return { isValid: false, message: "Invalid item selected for modifying build." };
      }

      const n = otherSelectedItems.length;
      for (let i = 0; i < (1 << n); i++) { // i=0 means only played card adds value
          const currentSummingGroup = [];
          const currentRemainingIds = new Set(otherSelectedItems.map(item => item.id));
          let summingGroupValue = 0;

          for (let j = 0; j < n; j++) {
              if ((i >> j) & 1) {
                  const item = otherSelectedItems[j];
                  if (!item || !item.id) continue;
                  currentSummingGroup.push(item);
                  summingGroupValue += getItemValue(item);
                  currentRemainingIds.delete(item.id);
              }
          }

          const currentBuildValue = playedCardValue + summingGroupValue + getItemValue(targetBuild);
          if (currentBuildValue <= 0) continue;

          const currentRemainingItems = otherSelectedItems.filter(item => currentRemainingIds.has(item.id));

          // Check 1: Matching Group
          if (currentRemainingItems.some(item => getItemValue(item) !== currentBuildValue)) {
              continue;
          }
          // Check 2: Holding Card
          const hasHoldingCard = playerHand.some(handCard =>
              handCard && handCard.suitRank !== playedCard.suitRank &&
              getBuildValue(handCard) === currentBuildValue
          );
          if (!hasHoldingCard) {
              continue;
          }
          // Check 3: Duplicate Build
          const existingPlayerBuildOfValue = tableItems.find(item =>
              item && item.id && item.type === 'build' &&
              item.value === currentBuildValue &&
              item.controller === currentPlayer &&
              item.id !== targetBuild.id
          );
          if (existingPlayerBuildOfValue) {
              continue;
          }

          // Valid modification found
          return {
              isValid: true,
              buildValue: currentBuildValue,
              isModification: true,
              targetBuild: targetBuild,
              summingItems: currentSummingGroup, // Items summed with played card
              cascadingItems: currentRemainingItems, // Items that matched the sum
              message: `Build ${currentBuildValue} is valid.`
          };
      } // End subset loop for modification

      // If no valid modification combination found
      // (Error message logic remains the same as previous version)
      const fullSumValue = otherSelectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
      const potentialFullTarget = playedCardValue + fullSumValue + getItemValue(targetBuild);
       const needsHoldingCardCheck = playerHand.some(handCard =>
            handCard && handCard.suitRank !== playedCard.suitRank &&
            getBuildValue(handCard) === potentialFullTarget
        );
       if (potentialFullTarget > 0 && !needsHoldingCardCheck) {
           return { isValid: false, message: `Invalid combination. You might need a ${potentialFullTarget} in hand.` };
       } else {
           return { isValid: false, message: "Invalid build modification selected." };
       }

  } else {
      // --- INITIATION Case (New Multi-Set Logic) ---
      // All selected items must be cards or simple builds here
       if (selectedItems.some(item => item.type === 'pair' || (item.type === 'build' && item.isCompound))) {
           // This check is technically redundant due to initial checks, but safe
           return { isValid: false, message: "Invalid items selected for build initiation." };
       }

      const n = selectedItems.length;
      // Iterate through all non-empty subsets of selectedItems as the potential "primary group"
      for (let i = 1; i < (1 << n); i++) {
          const primaryGroup = [];
          const remainingItemIds = new Set(selectedItems.map(item => item.id));
          let primaryGroupSum = 0;

          for (let j = 0; j < n; j++) {
              if ((i >> j) & 1) { // If the j-th item is in this primary group
                  const item = selectedItems[j];
                   if (!item || !item.id) continue; // Should not happen
                  primaryGroup.push(item);
                  primaryGroupSum += getItemValue(item);
                  remainingItemIds.delete(item.id);
              }
          }

          // Calculate the target value based on played card + this primary group
          const targetValue = playedCardValue + primaryGroupSum;
          if (targetValue <= 0) continue; // Build must have positive value

          // Get the remaining items
          const remainingItems = selectedItems.filter(item => remainingItemIds.has(item.id));

          // Check 1: Can the remaining items be partitioned into groups summing to targetValue?
          if (!canPartition(remainingItems, targetValue)) {
              // console.log(`Partition failed for target ${targetValue} with remaining`, remainingItems.map(i=>i.id));
              continue; // This primary group doesn't work, try the next one
          }

          // Check 2: Holding Card
          const hasHoldingCard = playerHand.some(handCard =>
              handCard && handCard.suitRank !== playedCard.suitRank &&
              getBuildValue(handCard) === targetValue
          );
          if (!hasHoldingCard) {
              // console.log(`Holding card check failed for target ${targetValue}`);
              continue; // This primary group doesn't work
          }

          // Check 3: Duplicate Build
          const existingPlayerBuildOfValue = tableItems.find(item =>
              item && item.id && item.type === 'build' &&
              item.value === targetValue && item.controller === currentPlayer
          );
          if (existingPlayerBuildOfValue) {
              // console.log(`Duplicate build check failed for target ${targetValue}`);
              continue; // This primary group doesn't work
          }

          // If all checks passed, this is a valid multi-set build
          // console.log(`Multi-set success: Target=${targetValue}, PrimaryGroup=${primaryGroup.map(i=>i.id)}, AdditionalGroups=${remainingItems.map(i=>i.id)}`);
          return {
              isValid: true,
              buildValue: targetValue,
              isModification: false, // It's an initiation
              targetBuild: null,
              summingItems: primaryGroup, // The group summed with the played card
              cascadingItems: remainingItems, // The items forming the additional groups
              message: `Build ${targetValue} is valid.`
          };

      } // End of primary group subset loop

      // --- Fallback: Check simple "Matching Initiation" (Play X, Select sum X, Hold X) ---
      const sumOfAllSelected = selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);
      if (sumOfAllSelected > 0 && playedCardValue === sumOfAllSelected) {
           const holdingMatching = playerHand.some(handCard =>
              handCard && handCard.suitRank !== playedCard.suitRank &&
              getBuildValue(handCard) === sumOfAllSelected
          );
          const duplicateMatching = tableItems.some(item =>
              item && item.id && item.type === 'build' &&
              item.value === sumOfAllSelected && item.controller === currentPlayer
          );
           if (holdingMatching && !duplicateMatching) {
               // Valid "Matching" Initiation
               return {
                  isValid: true,
                  buildValue: sumOfAllSelected,
                  isModification: false,
                  targetBuild: null,
                  summingItems: selectedItems, // All selected items form the sum
                  cascadingItems: [],
                  message: `Build ${sumOfAllSelected} is valid.`
              };
           }
      }

      // If no valid initiation path found
      return { isValid: false, message: "Invalid build combination or missing required card in hand." };
  }
};

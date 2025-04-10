// src/modules/buildLogic.js
import { getValue } from './deck';

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card) return 0;
    // Ensure rank is treated as a number if possible, default Ace to 1
    if (card.rank === 'A') return 1;
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank; // Return 0 for non-numeric ranks (J,Q,K)
};


// Helper to get the value of a table item for building (card or simple build)
const getItemValue = (item) => {
  if (!item) return 0;
  if (item.type === 'card') {
    return getBuildValue(item); // Use Ace=1
  }
  if (item.type === 'build' && !item.isCompound) {
    return item.value;
  }
  // Pairs and compound builds cannot be built upon
  return 0;
};

// Helper to check if a card is a face card
const isFaceCard = (card) => {
    return ['J', 'Q', 'K'].includes(card.rank);
}

/**
 * Validates if a build action is possible, including cascading.
 */
export const validateBuild = (playedCard, selectedItems, playerHand, tableItems, currentPlayer) => {
  if (!playedCard || selectedItems.length === 0) {
    return { isValid: false, message: "Select a card from hand and items from table." };
  }

  // Rule: Cannot use face cards
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  // Rule: Cannot build *on* or *select* compound builds or pairs for building
  if (selectedItems.some(item => (item.type === 'build' && item.isCompound) || item.type === 'pair')) {
      return { isValid: false, message: "Cannot use compound builds or pairs in building." };
  }
  // Rule: Cannot select multiple builds at once
  if (selectedItems.filter(item => item.type === 'build').length > 1) {
      return { isValid: false, message: "Cannot select multiple builds at once." };
  }

  const playedCardValue = getBuildValue(playedCard);

  // Separate selected items: those intended to sum, and those that might match the target value
  let potentialSummingItems = [];
  let potentialMatchingItems = []; // Items that might already equal the target value

  // Tentatively calculate target value based on played card + all selected items
  // This helps identify which selected items might already match
  const tempTargetValue = playedCardValue + selectedItems.reduce((sum, item) => sum + getItemValue(item), 0);

  selectedItems.forEach(item => {
      const itemVal = getItemValue(item);
      // If an item's value equals the tempTargetValue, it's potentially a matching item
      // Or, more accurately, calculate the target value based on a subset first.
      // Let's rethink: Identify the core summing group first.

      // Assume the player intends to sum the played card with *some* selected items.
      // Any *other* selected items must match the resulting sum.
      potentialSummingItems.push(item); // Start by assuming all selected items are for summing
  });

  // Calculate the target value based on played card + potential summing items
  const targetValue = playedCardValue + potentialSummingItems.reduce((sum, item) => sum + getItemValue(item), 0);

  // Now, re-evaluate selectedItems: separate actual summing items from cascading items
  let summingItems = [];
  let cascadingItems = []; // Items that match the targetValue

  selectedItems.forEach(item => {
      const itemVal = getItemValue(item);
      if (itemVal > 0 && itemVal === targetValue) {
          // This item matches the target value, it's for cascading
          // Ensure it's not a build being added to itself in a weird way
          if (item.type === 'build' && (playedCardValue + summingItems.reduce((sum, sItem) => sum + getItemValue(sItem), 0)) !== targetValue) {
             // This scenario is complex, disallow for now if a build matches but wasn't the sole item selected for modification
             // This prevents selecting Build(7) + Card(7) when playing a 7 (should be capture or pair)
             console.warn("Complex build scenario detected, potentially invalid selection.");
          } else {
             cascadingItems.push(item);
          }
      } else if (itemVal > 0) {
          // This item is part of the sum
          summingItems.push(item);
      }
  });

  // Recalculate targetValue based *only* on the actual summing items
  const finalTargetValue = playedCardValue + summingItems.reduce((sum, item) => sum + getItemValue(item), 0);

  // If cascading items exist, their value must match the finalTargetValue
  if (cascadingItems.length > 0 && cascadingItems.some(item => getItemValue(item) !== finalTargetValue)) {
      return { isValid: false, message: `Selected matching items (value ${getItemValue(cascadingItems[0])}) do not match the build sum value (${finalTargetValue}).` };
  }
  // If cascading items exist, ensure they are only cards (cannot cascade builds/pairs)
  if (cascadingItems.some(item => item.type !== 'card')) {
      return { isValid: false, message: "Can only cascade matching cards into a build, not existing builds or pairs." };
  }

  // Rule: Must hold a card matching the final target value IN HAND
  const hasCapturingCard = playerHand.some(handCard =>
      getBuildValue(handCard) === finalTargetValue &&
      handCard.suitRank !== playedCard.suitRank
  );
  if (!hasCapturingCard) {
    return { isValid: false, targetValue: finalTargetValue, message: `You must hold a ${finalTargetValue} in hand to make this build.` };
  }

  // Check if modifying an existing simple build (must be the only summing item of type build)
  const targetBuild = summingItems.find(item => item.type === 'build' && !item.isCompound);
  const isModification = !!targetBuild;

  // Check for duplicate build value rule
  const existingBuildOfValue = tableItems.find(item =>
      item.type === 'build' && item.value === finalTargetValue && item.controller === currentPlayer
  );
  // If a build of this value exists, and we are NOT modifying it (i.e., targetBuild is null or different)
  if (existingBuildOfValue && (!targetBuild || targetBuild.id !== existingBuildOfValue.id)) {
      return { isValid: false, message: `You already have a build of ${finalTargetValue}. Select it to add to it.` };
  }

  // If all checks pass
  return { isValid: true, targetValue: finalTargetValue, isModification, targetBuild, summingItems, cascadingItems, message: `Build ${finalTargetValue} is valid.` };
};

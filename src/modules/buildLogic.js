// src/modules/buildLogic.js
import { getValue } from './deck'; // Assuming getValue handles Ace=1 for builds

// Helper to get the build value of a card (Ace=1)
const getBuildValue = (card) => {
    if (!card) return 0;
    // Ensure rank is treated as a number if possible, default Ace to 1
    if (card.rank === 'A') return 1;
    // J, Q, K have no build value
    if (["J", "Q", "K"].includes(card.rank)) return 0;
    const numRank = parseInt(card.rank);
    return isNaN(numRank) ? 0 : numRank;
};


// Helper to get the value of a table item for building (card or simple build)
const getItemValue = (item) => {
  if (!item) return 0;
  if (item.type === 'card') {
    return getBuildValue(item); // Use Ace=1, JQK=0
  }
  if (item.type === 'build' && !item.isCompound) {
    return item.value;
  }
  // Pairs, compound builds, and face cards cannot be built upon/with
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

  // Rule: Cannot use face cards in builds (played or selected)
  if (isFaceCard(playedCard) || selectedItems.some(item => item.type === 'card' && isFaceCard(item))) {
      return { isValid: false, message: "Face cards cannot be used in builds." };
  }
  // Rule: Cannot build *on* or *select* compound builds or pairs for building
  if (selectedItems.some(item => (item.type === 'build' && item.isCompound) || item.type === 'pair')) {
      return { isValid: false, message: "Cannot use compound builds or pairs in building." };
  }
  // Rule: Cannot select multiple existing builds at once (can select one build + cards, or just cards)
  if (selectedItems.filter(item => item.type === 'build').length > 1) {
      return { isValid: false, message: "Cannot select multiple existing builds at once." };
  }

  const playedCardValue = getBuildValue(playedCard);
  if (playedCardValue === 0) { // Should be caught by face card check, but double-check
      return { isValid: false, message: "Played card has no build value." };
  }

  // --- Determine Summing vs Cascading Items ---
  let potentialSummingItems = [];
  let potentialTargetBuild = null; // The single existing build being modified, if any

  // Separate the potential build being modified from other selected items
  selectedItems.forEach(item => {
      if (item.type === 'build') { // Since we checked for >1 build earlier, this is the only one
          potentialTargetBuild = item;
      } else {
          potentialSummingItems.push(item); // Assume cards are for summing initially
      }
  });

  // Calculate the target value based on played card + potential summing items + target build (if any)
  const targetValue = playedCardValue
                      + potentialSummingItems.reduce((sum, item) => sum + getItemValue(item), 0)
                      + (potentialTargetBuild ? potentialTargetBuild.value : 0);

  // Now, re-evaluate the potentialSummingItems: which ones *actually* sum vs match?
  let summingItems = []; // Cards actually used in the sum calculation
  let cascadingItems = []; // Items (cards or simple builds) that match the targetValue

  potentialSummingItems.forEach(item => { // These are only cards at this point
      const itemVal = getItemValue(item);
      if (itemVal > 0 && itemVal === targetValue) {
          // This card matches the target value, it's for cascading
          cascadingItems.push(item);
      } else if (itemVal > 0) {
          // This card is part of the sum
          summingItems.push(item);
      }
      // Ignore items with value 0 (shouldn't happen if face cards excluded)
  });

  // If we are modifying an existing build, it's part of the "sum" conceptually
  const targetBuild = potentialTargetBuild; // Rename for clarity
  const isModification = !!targetBuild;

  // Recalculate the final target value based *only* on the played card and actual summing items/build
  const finalTargetValue = playedCardValue
                           + summingItems.reduce((sum, item) => sum + getItemValue(item), 0)
                           + (targetBuild ? targetBuild.value : 0);


  // If cascading items exist, their value must match the finalTargetValue
  if (cascadingItems.length > 0 && cascadingItems.some(item => getItemValue(item) !== finalTargetValue)) {
      // This case should be rare if logic is correct, but good failsafe
      return { isValid: false, message: `Selected matching items do not match the build sum value (${finalTargetValue}).` };
  }

  // Add the targetBuild itself to cascadingItems if its value matches the finalTargetValue
  // This handles the case where you play a 7, select Build(7) -> target is 7, cascade Build(7)
  if (targetBuild && !cascadingItems.some(c => c.id === targetBuild.id) && targetBuild.value === finalTargetValue) {
      cascadingItems.push(targetBuild);
      // If the targetBuild is now cascading, it's not being modified in the traditional sense
      // It's just being grouped with the played card. Reset summingItems if needed.
      // This logic gets complex. Let's simplify: If targetBuild.value === finalTargetValue,
      // it means playedCard + summingItems must have summed to 0.
      // This implies playedCard's value matched the targetBuild's value, and no other summing cards were selected.
      // Example: Play 7, select Build(7). finalTargetValue=7. targetBuild.value=7.
      // This is valid, targetBuild should be cascaded.
  }


  // Rule: Must hold a card matching the final target value IN HAND
  const hasCapturingCard = playerHand.some(handCard =>
      getBuildValue(handCard) === finalTargetValue &&
      handCard.suitRank !== playedCard.suitRank // Cannot use the played card itself
  );
  if (!hasCapturingCard) {
    return { isValid: false, targetValue: finalTargetValue, message: `You must hold a ${finalTargetValue} in hand to make this build.` };
  }

  // Rule: Cannot create a build value that duplicates an existing build *controlled by the player*,
  // unless modifying that specific build.
  const existingPlayerBuildOfValue = tableItems.find(item =>
      item.type === 'build' &&
      item.value === finalTargetValue &&
      item.controller === currentPlayer &&
      (!targetBuild || item.id !== targetBuild.id) // Exclude the build being modified
  );
  if (existingPlayerBuildOfValue) {
      return { isValid: false, message: `You already control a build of ${finalTargetValue}. Select it to add to it.` };
  }

  // If all checks pass
  return {
      isValid: true,
      targetValue: finalTargetValue,
      isModification: isModification && !cascadingItems.some(c => c.id === targetBuild.id), // It's only modification if targetBuild wasn't cascaded
      targetBuild: targetBuild, // The original build object being modified (if any)
      summingItems: summingItems, // Cards used in the sum
      cascadingItems: cascadingItems, // Cards/Builds matching the target value
      message: `Build ${finalTargetValue} is valid.`
  };
};

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
 * Validates if a build action is possible, including complex combinations.
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

    const playedCardValue = getBuildValue(playedCard);

    // --- Group the selected items into valid combinations ---
    let validCombinations = [];
    // Function to recursively find combinations
    const findCombinations = (arr, target, current = [], index = 0) => {
        if (target === 0) {
            validCombinations.push([...current]); // Found a valid combination
            return;
        }
        if (target < 0 || index >= arr.length) {
            return; // Invalid or end of array
        }

        const itemValue = getItemValue(arr[index]);
        // Include the current item
        current.push(arr[index]);
        findCombinations(arr, target - itemValue, current, index + 1);
        current.pop(); // Backtrack

        // Exclude the current item
        findCombinations(arr, target, current, index + 1);
    };

    // Find combinations that sum to the played card's value
    findCombinations(selectedItems, playedCardValue);

    // --- Validate the combinations ---
    if (validCombinations.length === 0 && selectedItems.length > 0) {
        return { isValid: false, message: "Selected items cannot form valid combinations." };
    }

    // --- Check if all selected items are part of a valid combination ---
    let usedItems = new Set();
    validCombinations.forEach(combo => {
        combo.forEach(item => usedItems.add(item));
    });

    if (usedItems.size !== selectedItems.length) {
        return { isValid: false, message: "Not all selected items are part of a valid combination." };
    }

    // --- Check if each individual build does not exceed 10 ---
    for (const combo of validCombinations) {
        let comboValue = playedCardValue;
        for (const item of combo) {
            comboValue += getItemValue(item);
        }
        if (comboValue > 10) {
            return { isValid: false, message: "Combined build value exceeds the maximum of 10." };
        }
    }

    // --- Rule: Must hold a card matching the target value IN HAND ---
    const hasCapturingCard = playerHand.some(handCard =>
        getBuildValue(handCard) === playedCardValue &&
        handCard.suitRank !== playedCard.suitRank
    );
    if (!hasCapturingCard) {
        return { isValid: false, targetValue: playedCardValue, message: `You must hold a ${playedCardValue} in hand to make this build.` };
    }

    // If all checks pass
    return { isValid: true, targetValue: playedCardValue, message: `Complex build of ${playedCardValue} is valid.` };
};

// src/modules/turns.js
import { validateBuild } from './buildLogic';
import { validatePair } from './pairLogic'; // Import pair validation
import { getValue, captureValues, combinationValue } from './deck';
import { CaptureValidator, areItemSetsEqual } from './captureLogic';

// Simple ID generator (could be combined)
let nextBuildId = 0;
const generateBuildId = () => `build-${nextBuildId++}`;
let nextPairId = 0;
const generatePairId = () => `pair-${nextPairId++}`;

/**
 * Handles the build action.
 */
export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
     // Pass playerHand to validateBuild
     const validation = validateBuild(playedCard, selectedItems, playerHand);
     if (!validation.isValid) {
       return { success: false, newTableItems: tableItems, message: validation.message };
     }
     // ... rest of build logic ...
     const { targetValue, isModification, targetBuild } = validation;
     let newBuildObject;
     let itemsToRemoveIds = selectedItems.map(item => item.id);
     let combinedCards = [{ ...playedCard }];
     selectedItems.forEach(item => {
         if (item.type === 'card') { combinedCards.push(item); }
         else if (item.type === 'build') { combinedCards.push(...item.cards); }
     });
     const playedCardBuildValue = combinationValue(playedCard.rank); // Use Ace=1 for compound check
     let isCompound = playedCardBuildValue === targetValue;
     if (!isCompound) {
         isCompound = selectedItems.some(item => {
             const itemValue = item.type === 'card' ? combinationValue(item.rank) : item.value;
             return itemValue === targetValue;
         });
     }
     newBuildObject = {
       type: 'build', id: generateBuildId(), value: targetValue,
       cards: combinedCards, controller: currentPlayer, isCompound: isCompound,
     };
     let updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
     updatedTableItems.push(newBuildObject);
     return {
       success: true, newTableItems: updatedTableItems,
       message: `Player ${currentPlayer} built ${targetValue}. ${isCompound ? '(Compound)' : '(Simple)'}`
     };
};

/**
 * Handles the pairing action.
 * @param {object} playedCard - Card played from hand.
 * @param {array} selectedItems - Card items selected from table.
 * @param {number} currentPlayer - 1 or 2.
 * @param {array} tableItems - Current items on the table.
 * @param {array} playerHand - Current player's hand.
 * @returns {object} - { success: boolean, newTableItems: array, message: string }
 */
export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    const validation = validatePair(playedCard, selectedItems, playerHand);

    if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
    }

    const { rank } = validation;
    // Ensure selected items have IDs before proceeding
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Cannot pair: Selected items missing IDs");
        return { success: false, newTableItems: tableItems, message: "Internal Error: Selection invalid." };
    }
    const itemsToRemoveIds = selectedItems.map(item => item.id);
    const combinedCards = [playedCard, ...selectedItems]; // Played card + selected table cards

    const newPairObject = {
        type: 'pair',
        id: generatePairId(),
        rank: rank,
        cards: combinedCards,
        controller: currentPlayer, // Track who made the pair (optional, but can be useful)
    };

    // Filter out the used items and add the new pair
    let updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
    updatedTableItems.push(newPairObject);

    return {
        success: true,
        newTableItems: updatedTableItems,
        message: `Player ${currentPlayer} paired ${rank}s.`
    };
};


/**
 * Checks if the user's selected items can be perfectly partitioned into
 * one or more valid capture sets.
 * [isValidMultiCaptureSelection function remains unchanged]
 */
const isValidMultiCaptureSelection = (selectedItems, validCaptureOptions) => {
    // ... (previous multi-capture validation logic) ...
    if (!selectedItems || selectedItems.length === 0 || !validCaptureOptions || validCaptureOptions.length === 0) {
        return false;
    }
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Some selected items are missing IDs");
        return false;
    }
    let remainingSelectedItemIds = new Set(selectedItems.map(item => item.id));
    let currentOptions = [...validCaptureOptions];
    let progressMade = true;
    while (progressMade && remainingSelectedItemIds.size > 0) {
        progressMade = false;
        let optionUsedIndex = -1;
        for (let i = 0; i < currentOptions.length; i++) {
            const validSet = currentOptions[i];
            if (!validSet.every(item => item && item.id)) {
                console.error("Valid capture option contains item(s) without ID:", validSet);
                continue;
            }
            const validSetIds = validSet.map(item => item.id);
            const canUseSet = validSetIds.every(id => remainingSelectedItemIds.has(id));
            if (canUseSet) {
                validSetIds.forEach(id => remainingSelectedItemIds.delete(id));
                progressMade = true;
                optionUsedIndex = i;
                break;
            }
        }
         if (optionUsedIndex !== -1) {
            currentOptions.splice(optionUsedIndex, 1);
         }
    }
    return remainingSelectedItemIds.size === 0;
};


/**
 * Handles the capture action, allowing for multiple independent captures.
 * [handleCapture function remains largely unchanged, but needs CaptureValidator update]
 */
export const handleCapture = (playedCard, selectedItems, currentPlayer,
    player1Score, player2Score, tableItems, lastCapturer) => {

    // 1. Find all theoretically valid individual captures (needs update for pairs)
    const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);

    // 2. Check if the user's selection is a valid combination of one or more options
    const isSelectionValid = isValidMultiCaptureSelection(selectedItems, allValidOptions);

    if (!isSelectionValid) {
        return {
            success: false,
            newP1Score: player1Score, newP2Score: player2Score,
            newTableItems: tableItems, newLastCapturer: lastCapturer,
            sweep: false, message: "Invalid capture selection.", capturedCards: []
        };
    }

    // 3. Process the valid capture
    let capturedCards = [playedCard];
    let currentP1Score = player1Score;
    let currentP2Score = player2Score;

    // Add cards from the selected items (including builds AND pairs)
    selectedItems.forEach(item => {
        if (item.type === 'card') {
            capturedCards.push(item);
        } else if (item.type === 'build' || item.type === 'pair') { // Include pairs here
            capturedCards.push(...item.cards);
        }
    });

    // 4. TODO: Calculate points based on capturedCards (Aces, 10D, 2S etc.)
    const pointsEarned = capturedCards.length -1;
     if (currentPlayer === 1) {
         currentP1Score += pointsEarned;
     } else {
         currentP2Score += pointsEarned;
     }

    // 5. Remove captured items from the table
     if (!selectedItems.every(item => item && item.id)) {
        console.error("Cannot remove items - selection contains items without IDs");
        return { success: false, message: "Internal error: Selected items missing IDs.", /* ... other state ... */ };
    }
    const selectedItemIds = selectedItems.map(item => item.id);
    const newTableItems = tableItems.filter(item => !selectedItemIds.includes(item.id));

    // 6. Check for sweep
    const sweep = newTableItems.length === 0;
    if (sweep) {
        if (currentPlayer === 1) { currentP1Score += 1; } else { currentP2Score += 1; }
    }

    // 7. Update last capturer
    const newLastCapturer = currentPlayer;

    return {
        success: true,
        newP1Score: currentP1Score, newP2Score: currentP2Score,
        newTableItems: newTableItems, newLastCapturer: newLastCapturer,
        sweep: sweep,
        message: `Player ${currentPlayer} captured ${selectedItems.length} item(s). ${sweep ? 'Sweep!' : ''}`,
        capturedCards: capturedCards
    };
};

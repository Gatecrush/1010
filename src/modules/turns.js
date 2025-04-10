// src/modules/turns.js
import { validateBuild } from './buildLogic';
import { validatePair } from './pairLogic';
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
    // Pass playerHand and tableItems to validateBuild
    const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
    if (!validation.isValid) {
      return { success: false, newTableItems: tableItems, message: validation.message };
    }
    // Get flags from validation
    const { targetValue, isModification, isAddingSet, targetBuild } = validation;

    let newBuildObject;
    let itemsToRemoveIds = selectedItems.map(item => item.id); // IDs of selected cards/build
    let cardsToAdd = [playedCard]; // Start with the played card

    // Collect cards from selected items *excluding* the targetBuild if modifying
    selectedItems.forEach(item => {
        if (item.type === 'card') {
            cardsToAdd.push(item);
        }
        // Don't add cards from targetBuild here, add them below
    });

    if (isModification && targetBuild) {
        // --- Modifying/Adding to Existing Build ---
        newBuildObject = {
            ...targetBuild, // Copy existing build properties (id, value, controller initially)
            cards: [...targetBuild.cards, ...cardsToAdd], // Combine old cards + new cards
            controller: currentPlayer, // Update controller to the current player
            isCompound: true // Adding a set always makes it compound (or keeps it compound)
        };
        // Filter out only the selected *cards* (the build itself is updated, not removed and re-added)
        itemsToRemoveIds = selectedItems.filter(item => item.type === 'card').map(item => item.id);
        let updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
        // Replace the old build object with the updated one
        updatedTableItems = updatedTableItems.map(item => item.id === targetBuild.id ? newBuildObject : item);

        return {
            success: true,
            newTableItems: updatedTableItems,
            message: `Player ${currentPlayer} added to build ${targetValue}.`
        };

    } else {
        // --- Creating a New Build ---
        // Determine if the new build is compound initially
        const playedCardBuildValue = combinationValue(playedCard.rank);
        let isCompound = playedCardBuildValue === targetValue;
        if (!isCompound) {
            isCompound = selectedItems.some(item => { // selectedItems are only cards here
                const itemValue = combinationValue(item.rank);
                return itemValue === targetValue;
            });
        }

        newBuildObject = {
          type: 'build',
          id: generateBuildId(),
          value: targetValue,
          cards: cardsToAdd, // Contains playedCard + selected cards
          controller: currentPlayer,
          isCompound: isCompound,
        };

        // Filter out the used items and add the new build
        let updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
        updatedTableItems.push(newBuildObject);

        return {
          success: true,
          newTableItems: updatedTableItems,
          message: `Player ${currentPlayer} built ${targetValue}. ${isCompound ? '(Compound)' : '(Simple)'}`
        };
    }
};

/**
 * Handles the pairing action.
 * [Previous handlePair code remains unchanged]
 */
export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    // ... (previous pair logic) ...
    const validation = validatePair(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
    if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
    }
    const { rank } = validation;
    let updatedTableItems = [...tableItems];
    let newPairObject;
    const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' ? selectedItems[0] : null;
    if (existingPair) {
        newPairObject = { ...existingPair, cards: [...existingPair.cards, playedCard], controller: currentPlayer };
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
    } else {
        const itemsToRemoveIds = selectedItems.map(item => item.id);
        const combinedCards = [playedCard, ...selectedItems];
        newPairObject = { type: 'pair', id: generatePairId(), rank: rank, cards: combinedCards, controller: currentPlayer };
        updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
        updatedTableItems.push(newPairObject);
    }
    return { success: true, newTableItems: updatedTableItems, message: `Player ${currentPlayer} paired ${rank}s.` };
};


/**
 * Checks if the user's selected items can be perfectly partitioned into
 * one or more valid capture sets.
 * [isValidMultiCaptureSelection function remains unchanged]
 */
const isValidMultiCaptureSelection = (selectedItems, validCaptureOptions) => {
    // ... (previous multi-capture validation logic) ...
    if (!selectedItems || selectedItems.length === 0 || !validCaptureOptions || validCaptureOptions.length === 0) { return false; }
    if (!selectedItems.every(item => item && item.id)) { console.error("Some selected items are missing IDs"); return false; }
    let remainingSelectedItemIds = new Set(selectedItems.map(item => item.id));
    let currentOptions = [...validCaptureOptions];
    let progressMade = true;
    while (progressMade && remainingSelectedItemIds.size > 0) {
        progressMade = false;
        let optionUsedIndex = -1;
        for (let i = 0; i < currentOptions.length; i++) {
            const validSet = currentOptions[i];
            if (!validSet.every(item => item && item.id)) { console.error("Valid capture option contains item(s) without ID:", validSet); continue; }
            const validSetIds = validSet.map(item => item.id);
            const canUseSet = validSetIds.every(id => remainingSelectedItemIds.has(id));
            if (canUseSet) {
                validSetIds.forEach(id => remainingSelectedItemIds.delete(id));
                progressMade = true; optionUsedIndex = i; break;
            }
        }
         if (optionUsedIndex !== -1) { currentOptions.splice(optionUsedIndex, 1); }
    }
    return remainingSelectedItemIds.size === 0;
};


/**
 * Handles the capture action, allowing for multiple independent captures.
 * Sweep bonus logic removed from here.
 */
export const handleCapture = (playedCard, selectedItems, currentPlayer,
    player1Score, player2Score, tableItems, lastCapturer) => {

    // 1. Find all theoretically valid individual captures
    const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);

    // 2. Check if the user's selection is a valid combination of one or more options
    const isSelectionValid = isValidMultiCaptureSelection(selectedItems, allValidOptions);

    if (!isSelectionValid) {
        return {
            success: false,
            newP1Score: player1Score, newP2Score: player2Score,
            newTableItems: tableItems, newLastCapturer: lastCapturer,
            message: "Invalid capture selection.", capturedCards: []
        };
    }

    // 3. Process the valid capture
    let capturedCards = [playedCard];
    let currentP1Score = player1Score;
    let currentP2Score = player2Score;

    // Add cards from the selected items
    selectedItems.forEach(item => {
        if (item.type === 'card') { capturedCards.push(item); }
        else if (item.type === 'build' || item.type === 'pair') { capturedCards.push(...item.cards); }
    });

    // 4. TODO: Calculate points based on capturedCards (Aces, 10D, 2S etc.)
    // Placeholder: just add 1 point per card captured for now
    const pointsEarned = capturedCards.length -1;
     if (currentPlayer === 1) { currentP1Score += pointsEarned; }
     else { currentP2Score += pointsEarned; }

    // 5. Remove captured items from the table
     if (!selectedItems.every(item => item && item.id)) {
        console.error("Cannot remove items - selection contains items without IDs");
        return { success: false, message: "Internal error: Selected items missing IDs.", /* ... other state ... */ };
    }
    const selectedItemIds = selectedItems.map(item => item.id);
    const newTableItems = tableItems.filter(item => !selectedItemIds.includes(item.id));

    // 6. Check for sweep REMOVED

    // 7. Update last capturer
    const newLastCapturer = currentPlayer;

    return {
        success: true,
        newP1Score: currentP1Score,
        newP2Score: currentP2Score,
        newTableItems: newTableItems,
        newLastCapturer: newLastCapturer,
        message: `Player ${currentPlayer} captured ${selectedItems.length} item(s).`, // Adjusted message
        capturedCards: capturedCards
    };
};

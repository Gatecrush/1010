// src/modules/turns.js
import { validateBuild } from './buildLogic';
import { validatePair } from './pairLogic';
import { getValue, captureValues, combinationValue } from './deck';
import { CaptureValidator, areItemSetsEqual } from './captureLogic';

// Simple ID generator
let nextBuildId = 0;
const generateBuildId = () => `build-${nextBuildId++}`;
let nextPairId = 0;
const generatePairId = () => `pair-${nextPairId++}`;

/**
 * Handles the build action, including multi-group validation.
 */
export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    // Pass all necessary context to validateBuild
    const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
    if (!validation.isValid) {
      return { success: false, newTableItems: tableItems, message: validation.message };
    }
    // Get detailed results from validation
    const { buildValue, isModification, targetBuild, summingItems, cascadingItems } = validation;

    let newBuildObject;
    // IDs of ALL originally selected items need to be removed or replaced
    let originalSelectionIds = selectedItems.map(item => item.id);

    // --- Collect all cards for the new/updated build ---
    let finalBuildCards = [playedCard]; // Played card always goes into the build

    // Add cards from the summingItems
    summingItems.forEach(item => {
        if (!item || !item.type) return; // Safety check
        if (item.type === 'card') { finalBuildCards.push(item); }
        else if (item.type === 'build' && item.cards) { finalBuildCards.push(...item.cards); } // Should only be simple builds
    });

    // Add cards from the cascadingItems
    cascadingItems.forEach(item => {
        if (!item || !item.type) return; // Safety check
        if (item.type === 'card') { finalBuildCards.push(item); }
        else if (item.type === 'build' && item.cards) { finalBuildCards.push(...item.cards); } // Should only be simple builds
    });

    // If it was a modification, add the original cards from the targetBuild
    // Ensure not to double-add if targetBuild was also in summing/cascading
    if (isModification && targetBuild) {
        if (!summingItems.some(i => i.id === targetBuild.id) && !cascadingItems.some(i => i.id === targetBuild.id)) {
             finalBuildCards.push(...targetBuild.cards);
        }
    }

    // --- Determine if the final build is compound ---
    // Compound if modifying, or if multiple items contributed (summing + cascading > 0),
    // or if any contributing item was itself a build.
    let isCompound = isModification ||
                     (summingItems.length + cascadingItems.length > 0) ||
                     summingItems.some(i => i.type === 'build') ||
                     cascadingItems.some(i => i.type === 'build');


    // --- Create or update the build object ---
    if (isModification && targetBuild) {
        newBuildObject = {
            ...targetBuild, // Keep original ID
            cards: finalBuildCards,
            controller: currentPlayer, // Update controller
            isCompound: isCompound, // Update compound status
            value: buildValue // Ensure value is correct
        };
    } else {
        newBuildObject = {
          type: 'build',
          id: generateBuildId(),
          value: buildValue, // Use the calculated buildValue
          cards: finalBuildCards,
          controller: currentPlayer,
          isCompound: isCompound,
        };
    }

    // --- Update the table items ---
    // 1. Filter out ALL originally selected items
    let updatedTableItems = tableItems.filter(item => item && item.id && !originalSelectionIds.includes(item.id));
    // 2. Add the new/updated build object
    updatedTableItems.push(newBuildObject);


    return {
      success: true,
      newTableItems: updatedTableItems,
      message: `Player ${currentPlayer} built ${buildValue}. ${isCompound ? '(Compound)' : '(Simple)'}` // Use buildValue in message
    };
};

/**
 * Handles the pairing action.
 */
export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    // Basic validation first
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) {
        return { success: false, newTableItems: tableItems, message: "Invalid input for pairing." };
    }
     // Ensure all selected items are valid objects with IDs
    if (!selectedItems.every(item => item && item.id)) {
      console.error("Pairing Error: Some selected items are invalid or missing IDs.");
      return { isValid: false, message: "Internal error: Invalid items selected for pair." };
    }

    const validation = validatePair(playedCard, selectedItems, playerHand);
    if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
    }
    const { rank } = validation;

    let updatedTableItems = [...tableItems];
    let newPairObject;

    const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' && selectedItems[0].rank === rank ? selectedItems[0] : null;

    if (existingPair) {
        // Ensure existingPair is valid before spreading
        if (!existingPair || !existingPair.cards) {
             console.error("Pairing Error: Invalid existing pair object.");
             return { success: false, newTableItems: tableItems, message: "Internal error: Invalid existing pair." };
        }
        newPairObject = {
            ...existingPair,
            cards: [...existingPair.cards, playedCard],
            controller: currentPlayer
        };
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
    } else {
        // Ensure selected items for pairing are only cards
        if (selectedItems.some(item => item.type !== 'card')) {
             return { success: false, newTableItems: tableItems, message: "Can only pair with cards." };
        }
        const itemsToRemoveIds = selectedItems.map(item => item.id);
        const combinedCards = [playedCard, ...selectedItems];
        newPairObject = {
            type: 'pair',
            id: generatePairId(),
            rank: rank,
            cards: combinedCards,
            controller: currentPlayer
        };
        // Filter out removed items and ensure table items are valid
        updatedTableItems = tableItems.filter(item => item && item.id && !itemsToRemoveIds.includes(item.id));
        updatedTableItems.push(newPairObject);
    }

    return {
        success: true,
        newTableItems: updatedTableItems,
        message: `Player ${currentPlayer} paired ${rank}s.`
    };
};


/**
 * Checks if the user's selected items can be perfectly partitioned into
 * one or more valid capture sets generated by CaptureValidator.getValidCaptures.
 */
const isValidMultiCaptureSelection = (selectedItems, validCaptureOptions) => {
    // Basic checks
    if (!selectedItems) return false; // Handle null/undefined selection
    if (selectedItems.length === 0) return true; // Empty selection is valid (captures nothing)
    if (!validCaptureOptions || validCaptureOptions.length === 0) return selectedItems.length === 0;

    // Ensure all items involved have IDs for reliable comparison
    if (!selectedItems.every(item => item && item.id)) {
        console.error("isValidMultiCaptureSelection Error: Some selected items are missing IDs");
        return false;
    }
    if (!validCaptureOptions.every(option => option && Array.isArray(option) && option.every(item => item && item.id))) {
         console.error("isValidMultiCaptureSelection Error: Some valid capture options are invalid or contain items missing IDs");
        return false;
    }

    // Use IDs for partitioning check
    let remainingSelectedItemIds = new Set(selectedItems.map(item => item.id));
    let currentOptions = [...validCaptureOptions]; // Copy options

    let progressMade = true;
    while (progressMade && remainingSelectedItemIds.size > 0) {
        progressMade = false;
        let optionUsedIndex = -1;

        for (let i = 0; i < currentOptions.length; i++) {
            const validSet = currentOptions[i];
            // Ensure validSet is an array before mapping
             if (!Array.isArray(validSet)) {
                 console.error("isValidMultiCaptureSelection Error: Option is not an array", validSet);
                 continue; // Skip invalid option
             }
            const validSetIds = validSet.map(item => item.id);
            const canUseSet = validSetIds.length > 0 && validSetIds.every(id => remainingSelectedItemIds.has(id));

            if (canUseSet) {
                validSetIds.forEach(id => remainingSelectedItemIds.delete(id));
                progressMade = true;
                optionUsedIndex = i;
                break;
            }
        }

        if (optionUsedIndex !== -1) {
            currentOptions.splice(optionUsedIndex, 1);
        } else if (remainingSelectedItemIds.size > 0) {
             return false; // No progress made, but items remain
        }
    }
    return remainingSelectedItemIds.size === 0;
};


/**
 * Handles the capture action, allowing for multiple independent captures.
 */
export const handleCapture = (playedCard, selectedItems, currentPlayer,
    player1Score, player2Score, tableItems, lastCapturer) => {

    // Basic validation
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) {
         return { success: false, message: "Invalid input for capture.", /* other state */ };
    }

    const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);
    let isSelectionValid = isValidMultiCaptureSelection(selectedItems, allValidOptions);

    // Fallback check for exact match if partitioning fails
    if (!isSelectionValid && selectedItems.length > 0) {
        for (const option of allValidOptions) {
            if (areItemSetsEqual(selectedItems, option)) {
                isSelectionValid = true;
                break;
            }
        }
    }

    if (!isSelectionValid) {
        return {
            success: false,
            newP1Score: player1Score, newP2Score: player2Score,
            newTableItems: tableItems, newLastCapturer: lastCapturer,
            message: "Invalid capture selection.", capturedCards: []
        };
    }

    // Process the valid capture
    let capturedCards = [playedCard];
    let currentP1Score = player1Score;
    let currentP2Score = player2Score;

    selectedItems.forEach(item => {
        if (!item) { console.error("Undefined item in selectedItems during capture processing"); return; }
        if (item.type === 'card') { capturedCards.push(item); }
        else if (item.type === 'build' || item.type === 'pair') {
             if (item.cards && Array.isArray(item.cards)) {
                 capturedCards.push(...item.cards);
             } else {
                 console.error("Build/Pair item missing cards array:", item);
             }
        }
    });

    // Remove captured items from the table
     if (!selectedItems.every(item => item && item.id)) {
        console.error("Cannot remove items - selection contains items without IDs");
        return { success: false, message: "Internal error: Selected items missing IDs.", /* other state */ };
    }
    const selectedItemIds = selectedItems.map(item => item.id);
    // Ensure tableItems are valid before filtering
    const validTableItems = tableItems.filter(item => item && item.id);
    const newTableItems = validTableItems.filter(item => !selectedItemIds.includes(item.id));


    // Check for sweep
    let sweepMessage = "";
    // Sweep occurs if the table is cleared AND the table wasn't empty before the capture
    if (newTableItems.length === 0 && validTableItems.length > 0) {
        if (currentPlayer === 1) { currentP1Score += 1; }
        else { currentP2Score += 1; }
        sweepMessage = " Sweep!";
    }

    const newLastCapturer = currentPlayer;

    return {
        success: true,
        newP1Score: currentP1Score,
        newP2Score: currentP2Score,
        newTableItems: newTableItems,
        newLastCapturer: newLastCapturer,
        message: `Player ${currentPlayer} captured ${selectedItems.length} item(s).${sweepMessage}`,
        capturedCards: capturedCards
    };
};

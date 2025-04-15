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
 * Handles the build action, using the validated summing/cascading groups.
 */
export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    // Pass all necessary context to validateBuild
    const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
    if (!validation.isValid) {
      return { success: false, newTableItems: tableItems, message: validation.message };
    }
    // Get detailed results from validation
    const { buildValue, isModification, targetBuild, summingItems, targetRank } = validation;

    let newBuildObject;
    // IDs of ALL originally selected items need to be removed or replaced
    // Ensure selectedItems is valid before mapping
    let originalSelectionIds = selectedItems ? selectedItems.map(item => item?.id).filter(id => id) : []; // Added safety check for selectedItems and item.id

    // --- Collect all cards for the new/updated build ---
    let finalBuildCards = [playedCard]; // Played card always goes into the build

    // Add cards from the summingItems (which should only be cards selected from table)
    // **** FIX: Check if summingItems exists and is an array before calling forEach ****
    if (summingItems && Array.isArray(summingItems)) {
        summingItems.forEach(item => { // <--- Error line was here
            if (!item || item.type !== 'card') {
                 console.error("handleBuild Error: summingItem is not a card", item);
                 return; // Skip non-card items if any slipped through validation (shouldn't happen)
            }
            finalBuildCards.push(item);
        });
    } else if (summingItems !== undefined) { // Log error if it exists but isn't an array
         console.error("handleBuild Error: summingItems is not a valid array", summingItems);
         // Handle this error case appropriately, maybe return failure
         return { success: false, newTableItems: tableItems, message: "Internal error processing build items." };
    }
    // If summingItems is undefined, it might be okay if it's a modification using only the played card

    // Add cards from the targetBuild if modifying
    if (isModification && targetBuild && targetBuild.cards) {
        // Ensure not to double-add if targetBuild was somehow selected (shouldn't happen with current logic)
         finalBuildCards.push(...targetBuild.cards);
    }

    // --- Determine if the final build is compound ---
    // A build becomes compound if it's a modification OR if multiple cards were involved initially
    // (playedCard + at least one summingItem OR playedCard + existing build)
    let isCompound = isModification || (summingItems && summingItems.length > 0);


    // --- Create or update the build object ---
    if (isModification && targetBuild) {
        newBuildObject = {
            ...targetBuild, // Keep original ID
            cards: finalBuildCards,
            controller: currentPlayer, // Update controller
            isCompound: isCompound, // Update compound status
            value: buildValue, // Update value
            targetRank: targetRank // Ensure targetRank is set/updated
        };
    } else {
        newBuildObject = {
          type: 'build',
          id: generateBuildId(),
          value: buildValue,
          cards: finalBuildCards,
          controller: currentPlayer,
          isCompound: isCompound,
          targetRank: targetRank // Set targetRank for new builds
        };
    }

    // --- Update the table items ---
    // 1. Filter out ALL originally selected items (cards and the modified build)
    let updatedTableItems = tableItems.filter(item => item && item.id && !originalSelectionIds.includes(item.id));
    // 2. Add the new/updated build object
    updatedTableItems.push(newBuildObject);


    return {
      success: true,
      newTableItems: updatedTableItems,
      message: validation.message // Use message from validation
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

    // Check if extending an existing pair (selectedItems contains only the existing pair)
    const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' && selectedItems[0].rank === rank ? selectedItems[0] : null;

    if (existingPair) {
        // Ensure existingPair is valid before spreading
        if (!existingPair || !existingPair.cards) {
             console.error("Pairing Error: Invalid existing pair object.");
             return { success: false, newTableItems: tableItems, message: "Internal error: Invalid existing pair." };
        }
        // Rule: Can only extend pairs you control
        if (existingPair.controller !== currentPlayer) {
             return { success: false, newTableItems: tableItems, message: "Cannot extend an opponent's pair." };
        }
        newPairObject = {
            ...existingPair,
            cards: [...existingPair.cards, playedCard],
            controller: currentPlayer // Controller remains the same
        };
        // Replace the old pair object with the updated one
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
    } else {
        // Creating a new pair from selected cards
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

        // Prioritize larger sets to avoid small sets blocking larger ones
        currentOptions.sort((a, b) => b.length - a.length);

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
                break; // Use the first valid set found (prioritizing larger ones)
            }
        }

        if (optionUsedIndex !== -1) {
            // Remove the used option to prevent re-use in the same partition attempt
            currentOptions.splice(optionUsedIndex, 1);
        } else if (remainingSelectedItemIds.size > 0) {
             // If no progress was made but items remain, the partition is not possible
             return false;
        }
    }
    // If all selected item IDs were used, the partition is valid
    return remainingSelectedItemIds.size === 0;
};


/**
 * Handles the capture action, allowing for multiple independent captures.
 */
export const handleCapture = (playedCard, selectedItems, currentPlayer,
    player1Score, player2Score, tableItems, lastCapturer) => {

    // Basic validation
    if (!playedCard || !selectedItems || !Array.isArray(selectedItems)) {
         return { success: false, message: "Invalid input for capture.", newP1Score: player1Score, newP2Score: player2Score, newTableItems: tableItems, newLastCapturer: lastCapturer, capturedCards: [] };
    }
     // Ensure all selected items are valid objects with IDs
    if (!selectedItems.every(item => item && item.id)) {
      console.error("Capture Error: Some selected items are invalid or missing IDs.");
      return { success: false, message: "Internal error: Invalid items selected for capture.", newP1Score: player1Score, newP2Score: player2Score, newTableItems: tableItems, newLastCapturer: lastCapturer, capturedCards: [] };
    }


    const allValidOptions = CaptureValidator.getValidCaptures(playedCard, tableItems);

    // Check if the exact selection matches one of the valid single capture options
    let isExactMatch = false;
    for (const option of allValidOptions) {
        if (areItemSetsEqual(selectedItems, option)) {
            isExactMatch = true;
            break;
        }
    }

    // Check if the selection can be partitioned into multiple valid captures
    const isMultiCapture = !isExactMatch && isValidMultiCaptureSelection(selectedItems, allValidOptions);

    if (!isExactMatch && !isMultiCapture) {
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

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
 * Handles the build action, incorporating cascading logic.
 */
export const handleBuild = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    // Pass all necessary context to validateBuild
    const validation = validateBuild(playedCard, selectedItems, playerHand, tableItems, currentPlayer);
    if (!validation.isValid) {
      return { success: false, newTableItems: tableItems, message: validation.message };
    }
    // Get detailed results from validation
    const { targetValue, isModification, targetBuild, summingItems, cascadingItems } = validation;

    let newBuildObject;
    // All originally selected items need to be removed from the table eventually
    let itemsToRemoveIds = selectedItems.map(item => item.id);

    // --- Collect all cards for the new/updated build ---
    let finalBuildCards = [playedCard];

    // Add cards from the items that were summed
    summingItems.forEach(item => { // These should only be cards
        if (item.type === 'card') {
            finalBuildCards.push(item);
        }
        // We don't add cards from targetBuild here, handle below
    });

    // Add cards from the items that were cascaded
    cascadingItems.forEach(item => {
        if (item.type === 'card') {
            finalBuildCards.push(item);
        } else if (item.type === 'build') { // Cascaded builds contribute their cards
            finalBuildCards.push(...item.cards);
        }
    });

    // If it was a modification (and the targetBuild wasn't cascaded), add its original cards
    if (isModification && targetBuild) {
         finalBuildCards.push(...targetBuild.cards);
    }

    // --- Determine if the final build is compound ---
    // It's compound if it was a modification, or if items were cascaded,
    // or if the initial build involved multiple components (played card + summing items > 1 total)
    let isCompound = isModification || cascadingItems.length > 0 || (summingItems.length > 0);


    // --- Create or update the build object ---
    if (isModification && targetBuild) {
        // Update the existing build object IN PLACE within the new array later
        // For now, define what the updated object should look like
        newBuildObject = {
            ...targetBuild, // Keep original ID and potentially other properties
            cards: finalBuildCards,
            controller: currentPlayer, // Update controller
            isCompound: isCompound, // Update compound status
            value: targetValue // Ensure value is correct (should be same)
        };
    } else {
        // Create a completely new build object
        newBuildObject = {
          type: 'build',
          id: generateBuildId(),
          value: targetValue,
          cards: finalBuildCards,
          controller: currentPlayer,
          isCompound: isCompound,
        };
    }

    // --- Update the table items ---
    // 1. Filter out ALL originally selected items
    let updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));

    // 2. Add the new/updated build object
    updatedTableItems.push(newBuildObject);


    return {
      success: true,
      newTableItems: updatedTableItems,
      message: `Player ${currentPlayer} built ${targetValue}. ${isCompound ? '(Compound)' : '(Simple)'}`
    };
};

/**
 * Handles the pairing action.
 */
export const handlePair = (playedCard, selectedItems, currentPlayer, tableItems, playerHand) => {
    const validation = validatePair(playedCard, selectedItems, playerHand); // Removed tableItems, currentPlayer as they aren't used in validatePair
    if (!validation.isValid) {
        return { success: false, newTableItems: tableItems, message: validation.message };
    }
    const { rank } = validation;

    let updatedTableItems = [...tableItems];
    let newPairObject;

    // Check if extending an existing pair (selectedItems contains exactly one pair of the target rank)
    const existingPair = selectedItems.length === 1 && selectedItems[0].type === 'pair' && selectedItems[0].rank === rank ? selectedItems[0] : null;

    if (existingPair) {
        // Extend the existing pair
        newPairObject = {
            ...existingPair,
            cards: [...existingPair.cards, playedCard], // Add the played card
            controller: currentPlayer // Update controller
        };
        // Replace the old pair object with the new one
        updatedTableItems = tableItems.map(item => (item.id === existingPair.id ? newPairObject : item));
    } else {
        // Create a new pair
        const itemsToRemoveIds = selectedItems.map(item => item.id); // IDs of the selected cards on table
        const combinedCards = [playedCard, ...selectedItems]; // Played card + selected table cards
        newPairObject = {
            type: 'pair',
            id: generatePairId(),
            rank: rank,
            cards: combinedCards,
            controller: currentPlayer
        };
        // Remove the selected cards from the table
        updatedTableItems = tableItems.filter(item => !itemsToRemoveIds.includes(item.id));
        // Add the new pair object
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
 * one or more valid capture sets.
 */
const isValidMultiCaptureSelection = (selectedItems, validCaptureOptions) => {
    if (!selectedItems || selectedItems.length === 0 || !validCaptureOptions || validCaptureOptions.length === 0) { return false; }
    // Ensure all selected items have IDs
    if (!selectedItems.every(item => item && item.id)) {
        console.error("Some selected items are missing IDs");
        return false; // Cannot reliably check partition
    }
    let remainingSelectedItemIds = new Set(selectedItems.map(item => item.id));
    let currentOptions = [...validCaptureOptions]; // Copy options to modify
    let progressMade = true;

    // Try to partition the selected items using the valid capture sets
    while (progressMade && remainingSelectedItemIds.size > 0) {
        progressMade = false;
        let optionUsedIndex = -1;

        // Find a valid capture set that is a subset of the remaining selected items
        for (let i = 0; i < currentOptions.length; i++) {
            const validSet = currentOptions[i];
            // Ensure items in the valid set have IDs
            if (!validSet.every(item => item && item.id)) {
                console.error("Valid capture option contains item(s) without ID:", validSet);
                continue; // Skip this option
            }
            const validSetIds = validSet.map(item => item.id);

            // Check if all items in this valid set are present in the remaining selected items
            const canUseSet = validSetIds.every(id => remainingSelectedItemIds.has(id));

            if (canUseSet) {
                // If yes, remove these items from the remaining set
                validSetIds.forEach(id => remainingSelectedItemIds.delete(id));
                progressMade = true;
                optionUsedIndex = i; // Mark this option as used
                break; // Move to the next iteration of the while loop
            }
        }

        // Remove the used option so it's not considered again
        if (optionUsedIndex !== -1) {
            currentOptions.splice(optionUsedIndex, 1);
        }
    }

    // The selection is valid if all selected items were partitioned (remaining set is empty)
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
        // Try to find the best single valid capture option that matches the selection
        // This handles cases where the user selects items that *could* form a valid capture,
        // even if it's not the maximal possible capture according to multi-capture rules.
        let singleMatchFound = false;
        for (const option of allValidOptions) {
            if (areItemSetsEqual(selectedItems, option)) {
                singleMatchFound = true;
                break;
            }
        }

        if (!singleMatchFound) {
            return {
                success: false,
                newP1Score: player1Score, newP2Score: player2Score,
                newTableItems: tableItems, newLastCapturer: lastCapturer,
                message: "Invalid capture selection.", capturedCards: []
            };
        }
        // If a single match was found, proceed as if that was the intended capture
        // console.log("Selection matches a single valid capture option.");
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

    // 4. Calculate points based ONLY on capturedCards (Aces, 10D, 2S)
    // The main scoring happens at the end of the game.
    // We only add sweep points here if applicable.
    // let pointsEarned = 0; // Reset points earned during turn

    // 5. Remove captured items from the table
     if (!selectedItems.every(item => item && item.id)) {
        console.error("Cannot remove items - selection contains items without IDs");
        return { success: false, message: "Internal error: Selected items missing IDs.", /* ... other state ... */ };
    }
    const selectedItemIds = selectedItems.map(item => item.id);
    const newTableItems = tableItems.filter(item => !selectedItemIds.includes(item.id));

    // 6. Check for sweep
    let sweepMessage = "";
    if (newTableItems.length === 0) {
        // Award sweep point immediately (adjust if rules differ)
        if (currentPlayer === 1) { currentP1Score += 1; }
        else { currentP2Score += 1; }
        sweepMessage = " Sweep!";
    }

    // 7. Update last capturer
    const newLastCapturer = currentPlayer;

    return {
        success: true,
        newP1Score: currentP1Score, // Pass updated score including potential sweep
        newP2Score: currentP2Score, // Pass updated score including potential sweep
        newTableItems: newTableItems,
        newLastCapturer: newLastCapturer,
        message: `Player ${currentPlayer} captured ${selectedItems.length} item(s).${sweepMessage}`, // Adjusted message
        capturedCards: capturedCards // Return the actual cards captured
    };
};
